import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  OrderPaymentStatus,
  PaymentGatewayCode,
  PaymentRecordStatus,
  Prisma,
  SystemActivityEventCategory,
  SystemActivityEventType,
  SystemActivitySeverity,
  SystemActivitySource,
  WebhookSource,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../database/prisma.service';
import { ActivityEventDispatcher } from '../../activity-event/activity-event-dispatcher.service';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { OrderService } from '../../order/services/order.service';
import { CreatePaymentDto } from '../dto/create-payment.dto';
import { generatePaymentReference } from '../entities/payment-reference.generator';
import { mapPayment } from '../entities/payment.mapper';
import { sanitizeGatewayPayload } from '../entities/gateway-payload-safety';
import {
  assertPaymentRecordTransition,
  assertWebhookAmountMatches,
  isWebhookPaymentExpired,
  mapWebhookStatusToPaymentStatus,
} from '../entities/payment-state.machine';
import { PaymentProviderRegistry } from '../providers/payment-provider.registry';
import {
  PaymentRepository,
  WebhookLogRepository,
} from '../repositories/payment.repository';
import { PaymentAuditService } from './payment-audit.service';
import { FulfillmentDispatchService } from '../../provider/services/fulfillment-dispatch.service';
import { NotificationService } from '../../notification/services/notification.service';

export interface WebhookHandlerResult {
  ok: true;
  duplicate?: boolean;
  manualReview?: boolean;
  paymentReference: string;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentRepository: PaymentRepository,
    private readonly webhookLogRepository: WebhookLogRepository,
    private readonly providerRegistry: PaymentProviderRegistry,
    private readonly orderService: OrderService,
    private readonly paymentAuditService: PaymentAuditService,
    private readonly fulfillmentDispatchService: FulfillmentDispatchService,
    private readonly notificationService: NotificationService,
    private readonly activityDispatcher: ActivityEventDispatcher,
  ) {}

  async createPayment(
    dto: CreatePaymentDto,
    idempotencyKey: string,
    user?: AuthenticatedUser,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const existing = await this.paymentRepository.findByIdempotencyKey(
      idempotencyKey.trim(),
    );
    if (existing) {
      const gatewayResponse = existing.gatewayResponse as Record<string, unknown>;
      const checkoutFormFields = readCheckoutFormFields(gatewayResponse);
      return mapPayment(existing, {
        paymentUrl:
          typeof gatewayResponse.paymentUrl === 'string'
            ? gatewayResponse.paymentUrl
            : undefined,
        checkoutUrl:
          typeof gatewayResponse.checkoutUrl === 'string'
            ? gatewayResponse.checkoutUrl
            : undefined,
        checkoutFormFields,
        displayMode: readDisplayMode(gatewayResponse),
        bankInfo: readBankInfo(gatewayResponse),
      });
    }

    const order = await this.prisma.order.findFirst({
      where: { id: dto.orderId, deletedAt: null },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.paymentStatus !== OrderPaymentStatus.WAITING_PAYMENT) {
      throw new BadRequestException('Order is not awaiting payment');
    }

    if (user && order.userId && order.userId !== user.id) {
      throw new NotFoundException('Order not found');
    }

    if (
      order.paymentExpiresAt &&
      order.paymentExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException('Order payment window has expired');
    }

    const provider = this.providerRegistry.get(dto.gateway);
    const paymentReference = generatePaymentReference();
    const expiresAt =
      order.paymentExpiresAt ??
      new Date(Date.now() + 15 * 60_000);

    const providerResult = await provider.createPayment({
      paymentReference,
      amount: new Decimal(order.totalAmount).toFixed(2),
      orderId: order.id,
      gateway: dto.gateway,
      expiresAt,
      guestEmail: order.isGuestOrder ? order.guestEmail : null,
    });

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          orderId: order.id,
          gateway: dto.gateway,
          methodCode: order.paymentMethodCode,
          settlementType: order.settlementType,
          paymentReference,
          idempotencyKey: idempotencyKey.trim(),
          amount: order.totalAmount,
          status: PaymentRecordStatus.PENDING,
          expiresAt,
          gatewayResponse: {
            paymentUrl: providerResult.paymentUrl,
            providerReference: providerResult.providerReference,
            checkoutUrl:
              typeof providerResult.rawResponse.checkoutUrl === 'string'
                ? providerResult.rawResponse.checkoutUrl
                : undefined,
            checkoutFormFields: readCheckoutFormFields(providerResult.rawResponse),
            ...providerResult.rawResponse,
          } as Prisma.InputJsonValue,
        },
      });

      await tx.order.update({
        where: { id: order.id },
        data: { paymentId: created.id },
      });

      return created;
    });

    await this.paymentAuditService.recordPaymentCreated({
      orderId: order.id,
      paymentId: payment.id,
      actorUserId: user?.id,
      metadata: {
        paymentReference,
        gateway: dto.gateway,
        idempotencyKey: idempotencyKey.trim(),
      },
    });

    return mapPayment(payment, {
      paymentUrl: providerResult.paymentUrl,
      checkoutUrl:
        typeof providerResult.rawResponse.checkoutUrl === 'string'
          ? providerResult.rawResponse.checkoutUrl
          : undefined,
      checkoutFormFields: readCheckoutFormFields(providerResult.rawResponse),
      displayMode: readDisplayMode(providerResult.rawResponse),
      bankInfo: readBankInfo(providerResult.rawResponse),
    });
  }

  async handleWebhook(
    gatewayParam: string,
    payload: unknown,
    headers: Record<string, string>,
    ipAddress?: string,
  ): Promise<WebhookHandlerResult> {
    const gateway = normalizeGatewayParam(gatewayParam);
    const provider = this.providerRegistry.get(gateway);
    const verification = await provider.verifyWebhook(payload, headers);

    const webhookSource = gatewayToWebhookSource(gateway);

    await this.webhookLogRepository.create({
      source: webhookSource,
      paymentReference: verification.paymentReference,
      payload: verification.rawPayload as object,
      signatureValid: verification.valid,
      ipAddress,
      processed: false,
    });

    if (!verification.valid) {
      this.activityDispatcher.dispatch({
        eventType: SystemActivityEventType.WEBHOOK_FAILED,
        eventCategory: SystemActivityEventCategory.WEBHOOK,
        severity: SystemActivitySeverity.ERROR,
        source: SystemActivitySource.API,
        resource: 'webhook',
        resourceDisplay: gateway,
        title: 'Webhook Failed',
        description: 'Invalid webhook signature',
        ipAddress: ipAddress ?? null,
        metadata: {
          gateway,
          paymentReference: verification.paymentReference,
        },
      });
      throw new UnauthorizedException('Invalid webhook signature');
    }

    if (verification.unknownReference) {
      return {
        ok: true,
        paymentReference: verification.paymentReference || '',
      };
    }

    if (!verification.paymentReference) {
      throw new NotFoundException('Payment reference not found in webhook');
    }

    const payment = await this.paymentRepository.findByReference(
      verification.paymentReference,
    );
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.gateway !== gateway) {
      throw new BadRequestException(
        `Gateway mismatch: payment is ${payment.gateway}, webhook is ${gateway}`,
      );
    }

    if (verification.status === 'PENDING') {
      return {
        ok: true,
        paymentReference: payment.paymentReference,
      };
    }

    if (verification.providerTransactionId) {
      const duplicateTx =
        await this.paymentRepository.findSuccessByProviderTransactionId(
          gateway,
          verification.providerTransactionId,
        );
      if (duplicateTx && duplicateTx.id !== payment.id) {
        return {
          ok: true,
          duplicate: true,
          paymentReference: payment.paymentReference,
        };
      }

      const gatewayResponse = payment.gatewayResponse as Record<string, unknown>;
      if (
        gatewayResponse.gatewayTransactionId === verification.providerTransactionId &&
        payment.status === PaymentRecordStatus.SUCCESS
      ) {
        return {
          ok: true,
          duplicate: true,
          paymentReference: payment.paymentReference,
        };
      }
    }

    if (payment.status === PaymentRecordStatus.SUCCESS) {
      return {
        ok: true,
        duplicate: true,
        paymentReference: payment.paymentReference,
      };
    }

    const nextStatus = mapWebhookStatusToPaymentStatus(verification.status);

    if (nextStatus === PaymentRecordStatus.SUCCESS) {
      const expired = isWebhookPaymentExpired({
        paymentStatus: payment.status,
        orderPaymentStatus: payment.order.paymentStatus,
        expiresAt: payment.expiresAt,
      });

      if (expired) {
        await this.handleLateSuccessWebhook(payment, verification.rawPayload);
        return {
          ok: true,
          manualReview: true,
          paymentReference: payment.paymentReference,
        };
      }

      assertWebhookAmountMatches(payment.amount, verification.amount);
    }

    assertPaymentRecordTransition(payment.status, nextStatus);

    if (nextStatus === PaymentRecordStatus.SUCCESS) {
      const gatewayResponse = this.mergeGatewayResponseWithTransactionId(
        verification.rawPayload as Prisma.InputJsonValue,
        verification.providerTransactionId,
      );

      const duplicate = await this.processSuccessWebhookAtomically(
        payment.id,
        payment.orderId,
        gatewayResponse,
      );

      if (duplicate) {
        return {
          ok: true,
          duplicate: true,
          paymentReference: payment.paymentReference,
        };
      }

      await this.paymentAuditService.recordPaymentSuccess({
        orderId: payment.orderId,
        paymentId: payment.id,
        metadata: { paymentReference: payment.paymentReference },
      });

      const queueJobIds = await this.fulfillmentDispatchService.dispatchOrderFulfillment(
        payment.orderId,
        'webhook',
      );
      this.logger.log(
        `Payment success enqueued fulfillment orderId=${payment.orderId} paymentReference=${payment.paymentReference} queueJobIds=${queueJobIds.join(',')}`,
      );
      await this.notificationService.notifyPaymentSuccess(payment.orderId);
    } else {
      const duplicate = await this.processFailedWebhookAtomically(
        payment.id,
        payment.orderId,
        verification.rawPayload as Prisma.InputJsonValue,
      );

      if (duplicate) {
        return {
          ok: true,
          duplicate: true,
          paymentReference: payment.paymentReference,
        };
      }

      await this.paymentAuditService.recordPaymentFailed({
        orderId: payment.orderId,
        paymentId: payment.id,
        metadata: { paymentReference: payment.paymentReference },
      });

      this.activityDispatcher.dispatch({
        eventType: SystemActivityEventType.WEBHOOK_FAILED,
        eventCategory: SystemActivityEventCategory.WEBHOOK,
        severity: SystemActivitySeverity.ERROR,
        source: SystemActivitySource.API,
        resource: 'webhook',
        resourceId: payment.id,
        resourceDisplay: payment.paymentReference,
        title: 'Webhook Failed',
        description: `Payment webhook reported failure for ${payment.paymentReference}`,
        ipAddress: ipAddress ?? null,
        metadata: {
          gateway,
          orderId: payment.orderId,
          paymentReference: payment.paymentReference,
          status: verification.status,
        },
      });
    }

    return {
      ok: true,
      paymentReference: payment.paymentReference,
    };
  }

  private async processSuccessWebhookAtomically(
    paymentId: string,
    orderId: string,
    gatewayResponse: Prisma.InputJsonValue,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const claim = await this.paymentRepository.claimPendingStatus(
        paymentId,
        PaymentRecordStatus.SUCCESS,
        { paidAt: new Date(), gatewayResponse },
        tx,
      );

      if (claim.count === 0) {
        const current = await tx.payment.findUnique({ where: { id: paymentId } });
        if (current?.status === PaymentRecordStatus.SUCCESS) {
          return true;
        }
        throw new ConflictException('Payment already processed');
      }

      await this.orderService.markPaidInTransaction(tx, orderId, paymentId);
      return false;
    });
  }

  private async processFailedWebhookAtomically(
    paymentId: string,
    orderId: string,
    gatewayResponse: Prisma.InputJsonValue,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const claim = await this.paymentRepository.claimPendingStatus(
        paymentId,
        PaymentRecordStatus.FAILED,
        { gatewayResponse },
        tx,
      );

      if (claim.count === 0) {
        const current = await tx.payment.findUnique({ where: { id: paymentId } });
        if (
          current?.status === PaymentRecordStatus.FAILED ||
          current?.status === PaymentRecordStatus.SUCCESS
        ) {
          return true;
        }
        throw new ConflictException('Payment already processed');
      }

      await this.orderService.markPaymentFailedInTransaction(tx, orderId);
      return false;
    });
  }

  private mergeGatewayResponseWithTransactionId(
    rawPayload: Prisma.InputJsonValue,
    providerTransactionId?: string,
  ): Prisma.InputJsonValue {
    const base =
      rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
        ? (rawPayload as Record<string, unknown>)
        : {};

    if (!providerTransactionId) {
      return base as Prisma.InputJsonValue;
    }

    return {
      ...base,
      gatewayTransactionId: providerTransactionId,
    } as Prisma.InputJsonValue;
  }

  private async handleLateSuccessWebhook(
    payment: {
      id: string;
      orderId: string;
      gatewayResponse: unknown;
    },
    rawPayload: Record<string, unknown>,
  ): Promise<void> {
    const existing =
      payment.gatewayResponse && typeof payment.gatewayResponse === 'object'
        ? (payment.gatewayResponse as Record<string, unknown>)
        : {};

    await this.paymentRepository.recordLateWebhookManualReview(payment.id, {
      ...existing,
      manualReview: true,
      lateWebhookAt: new Date().toISOString(),
      lateWebhookPayload: rawPayload as Prisma.InputJsonValue,
    } as Prisma.InputJsonValue);

    await this.notificationService.notifyManualPaymentReview(
      payment.id,
      payment.orderId,
    );
  }

  async listManualReviewQueue() {
    const [payments, unknownWebhooks] = await Promise.all([
      this.paymentRepository.findManualReviewPayments(),
      this.webhookLogRepository.findUnprocessedWebhooks(),
    ]);

    return {
      payments: payments.map((payment) => ({
        id: payment.id,
        paymentReference: payment.paymentReference,
        gateway: payment.gateway,
        amount: payment.amount.toFixed(2),
        status: payment.status,
        order: {
          id: payment.order.id,
          orderCode: payment.order.orderCode,
          paymentStatus: payment.order.paymentStatus,
          totalAmount: payment.order.totalAmount.toFixed(2),
          guestEmail: payment.order.guestEmail,
        },
        gatewayResponse: sanitizeGatewayPayload(payment.gatewayResponse),
        updatedAt: payment.updatedAt,
      })),
      unknownWebhooks: unknownWebhooks.map((webhook) => ({
        ...webhook,
        payload: sanitizeGatewayPayload(webhook.payload),
      })),
    };
  }

  async approveManualReview(paymentId: string, _adminId: string) {
    const payment = await this.requireManualReviewPayment(paymentId);
    this.assertManualReviewPaymentSafe(payment);
    const existing =
      payment.gatewayResponse && typeof payment.gatewayResponse === 'object'
        ? (payment.gatewayResponse as Record<string, unknown>)
        : {};

    const gatewayResponse = {
      ...existing,
      manualReview: false,
      manualReviewApprovedAt: new Date().toISOString(),
      adminApproved: true,
    } as Prisma.InputJsonValue;

    const duplicate = await this.processManualReviewApprovalAtomically(
      payment.id,
      payment.orderId,
      gatewayResponse,
    );

    if (!duplicate) {
      await this.fulfillmentDispatchService.dispatchOrderFulfillment(
        payment.orderId,
        'manual',
      );
    }

    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      action: 'approve' as const,
      duplicate,
    };
  }

  async rejectManualReview(
    paymentId: string,
    adminId: string,
    reason?: string,
  ) {
    const payment = await this.requireManualReviewPayment(paymentId);
    const existing =
      payment.gatewayResponse && typeof payment.gatewayResponse === 'object'
        ? (payment.gatewayResponse as Record<string, unknown>)
        : {};

    await this.paymentRepository.updateGatewayResponse(payment.id, {
      ...existing,
      manualReview: false,
      manualReviewRejectedAt: new Date().toISOString(),
      manualReviewRejectedBy: adminId,
      manualReviewRejectionReason: reason ?? null,
    } as Prisma.InputJsonValue);

    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      action: 'reject' as const,
    };
  }

  private async requireManualReviewPayment(paymentId: string) {
    const payment = await this.paymentRepository.findById(paymentId);
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    const gatewayResponse =
      payment.gatewayResponse && typeof payment.gatewayResponse === 'object'
        ? (payment.gatewayResponse as Record<string, unknown>)
        : {};

    if (!gatewayResponse.manualReview) {
      throw new BadRequestException('Payment is not pending manual review');
    }

    return payment;
  }

  private assertManualReviewPaymentSafe(
    payment: NonNullable<Awaited<ReturnType<PaymentRepository['findById']>>>,
  ): void {
    if (!payment.order) {
      throw new BadRequestException('Payment has no linked order');
    }

    const paymentAmount = new Decimal(payment.amount);
    const orderTotal = new Decimal(payment.order.totalAmount);
    if (!paymentAmount.equals(orderTotal)) {
      throw new BadRequestException(
        `Payment amount does not match order total: expected ${orderTotal.toFixed(2)}, got ${paymentAmount.toFixed(2)}`,
      );
    }

    const eligibleOrderStatuses: OrderPaymentStatus[] = [
      OrderPaymentStatus.WAITING_PAYMENT,
      OrderPaymentStatus.EXPIRED,
      OrderPaymentStatus.PAID,
    ];
    if (!eligibleOrderStatuses.includes(payment.order.paymentStatus)) {
      throw new BadRequestException(
        'Order is not eligible for manual payment approval',
      );
    }

    const gatewayResponse =
      payment.gatewayResponse && typeof payment.gatewayResponse === 'object'
        ? (payment.gatewayResponse as Record<string, unknown>)
        : {};
    const latePayload = gatewayResponse.lateWebhookPayload;
    if (latePayload && typeof latePayload === 'object' && !Array.isArray(latePayload)) {
      const record = latePayload as Record<string, unknown>;
      const webhookAmount =
        typeof record.amount === 'string' || typeof record.amount === 'number'
          ? String(record.amount)
          : undefined;
      if (webhookAmount) {
        assertWebhookAmountMatches(payment.amount, webhookAmount);
      }
    }
  }

  private async processManualReviewApprovalAtomically(
    paymentId: string,
    orderId: string,
    gatewayResponse: Prisma.InputJsonValue,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({
        where: { id: paymentId, deletedAt: null },
      });
      if (!payment) {
        throw new NotFoundException('Payment not found');
      }

      if (payment.status === PaymentRecordStatus.SUCCESS) {
        return true;
      }

      if (payment.status === PaymentRecordStatus.PENDING) {
        const claim = await this.paymentRepository.claimPendingStatus(
          paymentId,
          PaymentRecordStatus.SUCCESS,
          { paidAt: new Date(), gatewayResponse },
          tx,
        );
        if (claim.count === 0) {
          const current = await tx.payment.findUnique({ where: { id: paymentId } });
          if (current?.status === PaymentRecordStatus.SUCCESS) {
            return true;
          }
          throw new ConflictException('Payment already processed');
        }
      } else {
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: PaymentRecordStatus.SUCCESS,
            paidAt: new Date(),
            gatewayResponse,
          },
        });
      }

      await this.orderService.markPaidAfterManualReviewInTransaction(
        tx,
        orderId,
        paymentId,
      );
      return false;
    });
  }
}

function readCheckoutFormFields(
  gatewayResponse: Record<string, unknown>,
): Record<string, string> | undefined {
  const fields = gatewayResponse.checkoutFormFields;
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    return undefined;
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value != null) {
      result[key] = String(value);
    }
  }
  return Object.keys(result).length ? result : undefined;
}

function readDisplayMode(
  gatewayResponse: Record<string, unknown>,
): 'qr_inline' | 'redirect' | undefined {
  const mode = gatewayResponse.displayMode;
  if (mode === 'qr_inline' || mode === 'redirect') return mode;
  if (gatewayResponse.integrationMode === 'deposit_code_va') return 'qr_inline';
  if (gatewayResponse.integrationMode === 'legacy_qr') return 'qr_inline';
  return undefined;
}

function readBankInfo(
  gatewayResponse: Record<string, unknown>,
): {
  bankCode?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
  accountName?: string | null;
} | null {
  const raw = gatewayResponse.bank_info;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const info = raw as Record<string, unknown>;
  return {
    bankCode: typeof info.bankCode === 'string' ? info.bankCode : null,
    bankName: typeof info.bankName === 'string' ? info.bankName : null,
    accountNumber:
      typeof info.accountNumber === 'string' ? info.accountNumber : null,
    accountName: typeof info.accountName === 'string' ? info.accountName : null,
  };
}

function normalizeGatewayParam(value: string): PaymentGatewayCode {
  const upper = value.toUpperCase();
  if (upper === 'MEGAPAY') {
    return PaymentGatewayCode.MEGAPAY;
  }
  if (upper === 'SEPAY') {
    return PaymentGatewayCode.SEPAY;
  }
  throw new BadRequestException(`Unsupported gateway: ${value}`);
}

function gatewayToWebhookSource(gateway: PaymentGatewayCode): WebhookSource {
  return gateway === PaymentGatewayCode.MEGAPAY
    ? WebhookSource.MEGAPAY
    : WebhookSource.SEPAY;
}
