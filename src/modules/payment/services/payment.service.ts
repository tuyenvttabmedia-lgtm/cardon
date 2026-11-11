import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import {
  Order,
  Payment,
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
import { generatePaymentReference, generateSepayPaymentCode } from '../entities/payment-reference.generator';
import { mapPayment } from '../entities/payment.mapper';
import { sanitizeGatewayPayload } from '../entities/gateway-payload-safety';
import { isPersistedAdminTest, persistAdminTestFulfillmentSkip, readAdminTestCharge } from '../../esim/esim-admin-test.rules';
import { SettingsStoreService } from '../../settings/services/settings-store.service';
import { evaluatePaypalCheckoutReady } from '../providers/paypal/paypal.rules';
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
import { PaypalProvider } from '../providers/paypal/paypal.provider';
import { EsimSepayPaymentService } from './esim-sepay-payment.service';
import {
  evaluatePaypalWebhookIdentity,
  planPaypalSettlement,
  readPaypalSnapshot,
  type PaypalPlan,
} from '../providers/paypal/paypal.rules';
import { EsimPaypalPaymentService } from './esim-paypal-payment.service';
import { EsimMegapayPaymentService } from './esim-megapay-payment.service';

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
    @Optional()
    private readonly settingsStore?: SettingsStoreService,
    @Optional()
    private readonly esimSepayPaymentService?: EsimSepayPaymentService,
    @Optional()
    private readonly esimPaypalPaymentService?: EsimPaypalPaymentService,
    @Optional()
    private readonly esimMegapayPaymentService?: EsimMegapayPaymentService,
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
      if (existing.orderId !== dto.orderId) {
        throw new NotFoundException('Order not found');
      }
      const linkedOrder = await this.prisma.order.findFirst({
        where: { id: existing.orderId, deletedAt: null },
      });
      if (!linkedOrder) {
        throw new NotFoundException('Order not found');
      }
      this.assertPaymentOrderAccess(linkedOrder, user, dto.guestEmail);
      if (adminTestPaypalCreateIncomplete(existing)) {
        if (
          linkedOrder.paymentGateway === PaymentGatewayCode.PAYPAL &&
          isPersistedAdminTest(linkedOrder.clientTrace)
        ) {
          return this.createAdminTestPaypalPayment(linkedOrder, idempotencyKey.trim(), user?.id);
        }
      }
      if (esimPaypalCreateIncomplete(existing)) {
        if (!this.esimPaypalPaymentService) {
          throw new BadRequestException('eSIM PayPal checkout is not configured');
        }
        return this.esimPaypalPaymentService.completeOpenPayment(existing.id);
      }
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
        checkoutClient: readCheckoutClient(gatewayResponse),
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

    this.assertPaymentOrderAccess(order, user, dto.guestEmail);

    if (
      order.paymentExpiresAt &&
      order.paymentExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException('Order payment window has expired');
    }

    if (dto.gateway === PaymentGatewayCode.PAYPAL && order.paymentGateway !== 'PAYPAL') {
      throw new BadRequestException('PayPal is only available for international eSIM orders');
    }
    if (order.paymentGateway === 'PAYPAL' && dto.gateway !== PaymentGatewayCode.PAYPAL) {
      throw new BadRequestException('International eSIM orders must be paid with PayPal');
    }
    if (dto.gateway === PaymentGatewayCode.PAYPAL && isPersistedAdminTest(order.clientTrace)) {
      return this.createAdminTestPaypalPayment(order, idempotencyKey.trim(), user?.id);
    }
    const esimOnly = await this.isEsimOnlyOrder(order.id);
    if (esimOnly && dto.gateway === PaymentGatewayCode.PAYPAL) {
      if (!this.esimPaypalPaymentService) {
        throw new BadRequestException('eSIM PayPal checkout is not configured');
      }
      return this.esimPaypalPaymentService.createFromSnapshot({
        orderId: order.id,
        idempotencyKey: idempotencyKey.trim(),
        userId: user?.id,
      });
    }
    if (esimOnly && dto.gateway === PaymentGatewayCode.MEGAPAY) {
      if (!this.esimMegapayPaymentService) {
        throw new BadRequestException('eSIM MegaPay checkout is not configured');
      }
      return this.esimMegapayPaymentService.createFromSnapshot({
        orderId: order.id,
        gateway: dto.gateway,
        idempotencyKey: idempotencyKey.trim(),
        userId: user?.id,
      });
    }
    if (esimOnly) {
      if (!this.esimSepayPaymentService) {
        throw new BadRequestException('eSIM SePay checkout is not configured');
      }
      return this.esimSepayPaymentService.createFromSnapshot({
        orderId: order.id,
        gateway: dto.gateway,
        idempotencyKey: idempotencyKey.trim(),
        userId: user?.id,
      });
    }

    const provider = this.providerRegistry.get(dto.gateway);
    let gateway = dto.gateway;
    let paymentReference =
      gateway === PaymentGatewayCode.SEPAY
        ? generateSepayPaymentCode()
        : generatePaymentReference();
    const expiresAt =
      order.paymentExpiresAt ??
      new Date(Date.now() + 15 * 60_000);

    let providerResult;
    try {
      providerResult = await provider.createPayment({
        paymentReference,
        amount: new Decimal(order.totalAmount).toFixed(2),
        orderId: order.id,
        gateway,
        expiresAt,
        guestEmail: order.isGuestOrder ? order.guestEmail : null,
        methodCode: order.paymentMethodCode,
        currency: gateway === PaymentGatewayCode.PAYPAL ? 'USD' : 'VND',
      });
    } catch (primaryError) {
      // B2C failover: MegaPay down/locked → SePay bank transfer (still dự phòng).
      if (
        gateway === PaymentGatewayCode.MEGAPAY &&
        this.canFailoverRetailToSepay()
      ) {
        gateway = PaymentGatewayCode.SEPAY;
        paymentReference = generateSepayPaymentCode();
        const failoverProvider = this.providerRegistry.get(gateway);
        providerResult = await failoverProvider.createPayment({
          paymentReference,
          amount: new Decimal(order.totalAmount).toFixed(2),
          orderId: order.id,
          gateway,
          expiresAt,
          guestEmail: order.isGuestOrder ? order.guestEmail : null,
          methodCode: 'VIETQR',
          preferLegacyQr: true,
        });
        providerResult = {
          ...providerResult,
          rawResponse: {
            ...providerResult.rawResponse,
            failoverFrom: PaymentGatewayCode.MEGAPAY,
            failoverReason:
              primaryError instanceof Error
                ? primaryError.message
                : 'MegaPay createPayment failed',
          },
        };
      } else {
        throw primaryError;
      }
    }

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          orderId: order.id,
          gateway,
          methodCode:
            gateway === PaymentGatewayCode.SEPAY &&
            dto.gateway === PaymentGatewayCode.MEGAPAY
              ? 'VIETQR'
              : order.paymentMethodCode,
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
            checkoutClient: readCheckoutClient(providerResult.rawResponse),
            ...providerResult.rawResponse,
          } as Prisma.InputJsonValue,
        },
      });

      await tx.order.update({
        where: { id: order.id },
        data: {
          paymentId: created.id,
          ...(gateway !== dto.gateway
            ? {
                paymentGateway: gateway,
                paymentMethodCode:
                  gateway === PaymentGatewayCode.SEPAY ? 'VIETQR' : order.paymentMethodCode,
              }
            : {}),
        },
      });

      return created;
    });

    await this.paymentAuditService.recordPaymentCreated({
      orderId: order.id,
      paymentId: payment.id,
      actorUserId: user?.id,
      metadata: {
        paymentReference,
        gateway,
        requestedGateway: dto.gateway,
        idempotencyKey: idempotencyKey.trim(),
        failover:
          gateway !== dto.gateway
            ? { from: dto.gateway, to: gateway }
            : undefined,
      },
    });

    return mapPayment(payment, {
      paymentUrl: providerResult.paymentUrl,
      checkoutUrl:
        typeof providerResult.rawResponse.checkoutUrl === 'string'
          ? providerResult.rawResponse.checkoutUrl
          : undefined,
      checkoutFormFields: readCheckoutFormFields(providerResult.rawResponse),
      checkoutClient: readCheckoutClient(providerResult.rawResponse),
      displayMode: readDisplayMode(providerResult.rawResponse),
      bankInfo: readBankInfo(providerResult.rawResponse),
    });
  }

  /**
   * Admin-test PayPal charges the stored USD snapshot, never the VND catalog total.
   * The PENDING payment and its PayPal-Request-Id are committed before any HTTP call.
   */
  private async createAdminTestPaypalPayment(order: Order, idempotencyKey: string, actorUserId?: string) {
    const charge = readAdminTestCharge(order.clientTrace);
    if (!charge) {
      throw new BadRequestException('Admin test PayPal charge is missing');
    }
    const config = this.settingsStore?.resolvePaypalConfig();
    if (!config || config.mode !== 'sandbox') {
      throw new BadRequestException('Admin test PayPal requires sandbox mode');
    }
    const ready = evaluatePaypalCheckoutReady(config);
    if (!ready.ok || ready.mode !== 'sandbox') {
      throw new BadRequestException(
        `PayPal configuration is not ready: ${ready.ok ? 'LIVE' : ready.reason}`,
      );
    }

    const expiresAt = order.paymentExpiresAt ?? new Date(Date.now() + 15 * 60_000);
    const prepared = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT id FROM orders WHERE id = CAST(${order.id} AS uuid) FOR UPDATE`;
        const existing = await tx.payment.findFirst({
          where: {
            orderId: order.id,
            deletedAt: null,
            gateway: PaymentGatewayCode.PAYPAL,
            status: { in: [PaymentRecordStatus.PENDING, PaymentRecordStatus.SUCCESS] },
          },
          orderBy: { createdAt: 'desc' },
        });
        if (existing) {
          if (new Decimal(existing.amount).toFixed(2) !== charge.amount) {
            throw new BadRequestException(
              'Admin test PayPal amount cannot change after the PayPal order is created',
            );
          }
          return { created: false as const, payment: existing };
        }

        const paymentReference = generatePaymentReference();
        const created = await tx.payment.create({
          data: {
            orderId: order.id,
            gateway: PaymentGatewayCode.PAYPAL,
            methodCode: order.paymentMethodCode,
            settlementType: order.settlementType,
            paymentReference,
            idempotencyKey,
            amount: new Decimal(charge.amount),
            status: PaymentRecordStatus.PENDING,
            expiresAt,
            gatewayResponse: {},
          },
        });
        await tx.order.update({
          where: { id: order.id },
          data: { paymentId: created.id },
        });
        return { created: true as const, payment: created };
      },
      { maxWait: 5_000, timeout: 8_000 },
    );

    if (prepared.created) {
      await this.paymentAuditService.recordPaymentCreated({
        orderId: order.id,
        paymentId: prepared.payment.id,
        actorUserId,
        metadata: {
          paymentReference: prepared.payment.paymentReference,
          gateway: PaymentGatewayCode.PAYPAL,
          requestedGateway: PaymentGatewayCode.PAYPAL,
          idempotencyKey,
          adminTestChargeUsd: charge.amount,
        },
      });
    }

    return this.completeAdminTestPaypalCreate(order, prepared.payment, charge.amount, expiresAt);
  }

  /**
   * PayPal Create Order runs only after the payment row is committed.
   * A retry reuses paymentReference as PayPal-Request-Id and never opens a second payment.
   */
  private async completeAdminTestPaypalCreate(
    order: Order,
    payment: Payment,
    amount: string,
    expiresAt: Date,
  ) {
    const stored = readGatewayObject(payment.gatewayResponse);
    if (stored.adminTestCreate === 'NEED_MANUAL_REVIEW') {
      throw new BadRequestException(
        'Admin test PayPal create is past the 6 hour idempotency window and needs manual reconciliation',
      );
    }
    if (payment.status === PaymentRecordStatus.SUCCESS || adminTestPaypalReady(payment.gatewayResponse)) {
      return mapAdminTestPaypalPayment(payment);
    }

    const paypalOrderId = readPaypalOrderId(payment.gatewayResponse);
    const ageMs = Date.now() - new Date(payment.createdAt).getTime();
    if (!paypalOrderId && ageMs > PAYPAL_CREATE_IDEMPOTENCY_MS) {
      await this.markAdminTestPaypalManualReview(payment.id);
      throw new BadRequestException(
        'Admin test PayPal create is past the 6 hour idempotency window and needs manual reconciliation',
      );
    }
    if (paypalOrderId && ageMs > PAYPAL_CREATE_IDEMPOTENCY_MS) {
      throw new BadRequestException(
        'Admin test PayPal create is past the 6 hour idempotency window and needs manual reconciliation',
      );
    }

    const provider = this.providerRegistry.get(PaymentGatewayCode.PAYPAL);
    const providerResult = await provider.createPayment({
      paymentReference: payment.paymentReference,
      amount,
      orderId: order.id,
      gateway: PaymentGatewayCode.PAYPAL,
      expiresAt,
      guestEmail: order.isGuestOrder ? order.guestEmail : null,
      methodCode: order.paymentMethodCode,
      currency: 'USD',
    });
    const saved = await this.saveAdminTestPaypalResult(payment.id, providerResult);
    return mapAdminTestPaypalPayment(saved, providerResult);
  }

  private async saveAdminTestPaypalResult(
    paymentId: string,
    providerResult: {
      paymentUrl: string;
      providerReference: string;
      rawResponse: Record<string, unknown>;
    },
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT id FROM payments WHERE id = CAST(${paymentId} AS uuid) FOR UPDATE`;
        const current = await tx.payment.findFirst({
          where: { id: paymentId, deletedAt: null },
        });
        if (!current) {
          throw new NotFoundException('Payment not found');
        }
        const currentId = readPaypalOrderId(current.gatewayResponse);
        if (currentId && currentId !== providerResult.providerReference) return current;
        if (currentId && readPaymentUrl(current.gatewayResponse)) return current;
        return tx.payment.update({
          where: { id: paymentId },
          data: {
            status: PaymentRecordStatus.PENDING,
            gatewayResponse: {
              paymentUrl: providerResult.paymentUrl,
              providerReference: providerResult.providerReference,
              checkoutUrl:
                typeof providerResult.rawResponse.checkoutUrl === 'string'
                  ? providerResult.rawResponse.checkoutUrl
                  : undefined,
              checkoutFormFields: readCheckoutFormFields(providerResult.rawResponse),
              checkoutClient: readCheckoutClient(providerResult.rawResponse),
              ...providerResult.rawResponse,
            } as Prisma.InputJsonValue,
          },
        });
      },
      { maxWait: 5_000, timeout: 8_000 },
    );
  }

  private async markAdminTestPaypalManualReview(paymentId: string) {
    await this.prisma.$transaction(
      async (tx) => {
        const current = await tx.payment.findFirst({
          where: { id: paymentId, deletedAt: null },
        });
        const raw = readGatewayObject(current?.gatewayResponse);
        if (raw.adminTestCreate === 'NEED_MANUAL_REVIEW' || readPaypalOrderId(raw)) return;
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: PaymentRecordStatus.PENDING,
            gatewayResponse: {
              ...raw,
              adminTestCreate: 'NEED_MANUAL_REVIEW',
              reason: 'PAYPAL_IDEMPOTENCY_WINDOW_EXPIRED',
            },
          },
        });
      },
      { maxWait: 5_000, timeout: 8_000 },
    );
  }

  async handleWebhook(
    gatewayParam: string,
    payload: unknown,
    headers: Record<string, string>,
    ipAddress?: string,
  ): Promise<WebhookHandlerResult> {
    const gateway = normalizeGatewayParam(gatewayParam);
    const provider = this.providerRegistry.get(gateway);
    let verification = await provider.verifyWebhook(payload, headers);

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

    if (payment.productLane === 'ESIM' && gateway === PaymentGatewayCode.PAYPAL) {
      if (!this.esimPaypalPaymentService) {
        throw new BadRequestException('eSIM PayPal checkout is not configured');
      }
      const settled = await this.esimPaypalPaymentService.handleVerifiedWebhook({
        paymentId: payment.id,
        payload,
      });
      return {
        ok: true,
        duplicate: settled.outcome === 'DUPLICATE',
        paymentReference: payment.paymentReference,
      };
    }

    // eSIM SePay must not fall through to the retail webhook settlement path.
    if (payment.productLane === 'ESIM' && gateway === PaymentGatewayCode.SEPAY) {
      if (!this.esimSepayPaymentService) {
        throw new BadRequestException('eSIM SePay checkout is not configured');
      }
      const settled = await this.esimSepayPaymentService.handleIpn(payload, headers);
      return {
        ok: true,
        duplicate: settled.outcome === 'DUPLICATE',
        paymentReference: payment.paymentReference,
      };
    }

    if (payment.productLane === 'ESIM' && gateway === PaymentGatewayCode.MEGAPAY) {
      if (!this.esimMegapayPaymentService) {
        throw new BadRequestException('eSIM MegaPay checkout is not configured');
      }
      const settled = await this.esimMegapayPaymentService.handleVerifiedWebhook({
        paymentId: payment.id,
        verification,
      });
      return {
        ok: true,
        duplicate: settled.outcome === 'DUPLICATE',
        paymentReference: payment.paymentReference,
      };
    }

    if (
      gateway === PaymentGatewayCode.PAYPAL &&
      verification.status === 'PENDING' &&
      verification.rawPayload.paypalEvent === 'CHECKOUT.ORDER.APPROVED'
    ) {
      const outcome = await this.advancePaypal(payment);
      if (outcome.kind === 'pending' || outcome.kind === 'duplicate') {
        return {
          ok: true,
          duplicate: outcome.kind === 'duplicate',
          paymentReference: payment.paymentReference,
        };
      }
      if (outcome.kind === 'failed') {
        verification = { ...verification, status: 'FAILED' };
      } else {
        verification = {
          ...verification,
          status: 'SUCCESS',
          amount: outcome.amount,
          providerTransactionId: outcome.captureId,
        };
      }
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
      if (payment.gateway === PaymentGatewayCode.PAYPAL) {
        await this.queuePaypalFulfillmentIfNeeded(payment);
      }
      return {
        ok: true,
        duplicate: true,
        paymentReference: payment.paymentReference,
      };
    }

    const nextStatus = mapWebhookStatusToPaymentStatus(verification.status);

    if (nextStatus === PaymentRecordStatus.SUCCESS) {
      if (gateway === PaymentGatewayCode.PAYPAL) {
        const identity = evaluatePaypalWebhookIdentity({
          payload,
          storedOrderId: readPaypalSnapshot(payment).paypalOrderId,
          expectedAmount: new Decimal(payment.amount.toString()).toFixed(2),
        });
        if (!identity.ok) {
          this.logger.warn(
            `PayPal webhook identity rejected ${identity.reason} reference=${payment.paymentReference}`,
          );
          return {
            ok: true,
            paymentReference: payment.paymentReference,
          };
        }
      }

      // Amount must match before settle OR late manual-review queue — underpay must not be approvable.
      assertWebhookAmountMatches(payment.amount, verification.amount);

      const expired = isWebhookPaymentExpired({
        paymentStatus: payment.status,
        orderPaymentStatus: payment.order.paymentStatus,
        expiresAt: payment.expiresAt,
      });

      if (expired) {
        await this.handleLateSuccessWebhook(payment, {
          amount: new Decimal(verification.amount!).toFixed(2),
          providerTransactionId: verification.providerTransactionId ?? null,
          rawPayload: verification.rawPayload,
        });
        return {
          ok: true,
          manualReview: true,
          paymentReference: payment.paymentReference,
        };
      }
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

      if (payment.gateway === PaymentGatewayCode.PAYPAL) {
        await this.queuePaypalFulfillmentIfNeeded(payment);
      } else {
        const queueJobIds = await this.fulfillmentDispatchService.dispatchOrderFulfillment(
          payment.orderId,
          'webhook',
        );
        this.logger.log(
          `Payment success enqueued fulfillment orderId=${payment.orderId} paymentReference=${payment.paymentReference} queueJobIds=${queueJobIds.join(',')}`,
        );
      }
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

  /**
   * Return-URL / poll reconcile. Queries the gateway; never trusts ?payment=success.
   * On SUCCESS, same path as webhook: mark PAID then dispatch esim_queue / card / topup.
   */
  async syncFromGateway(orderId: string, user?: AuthenticatedUser) {
    if (!user?.id) {
      throw new UnauthorizedException('Login required');
    }
    const payment = await this.paymentRepository.findLatestByOrderId(orderId);
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    // Owner only. Guest orders (userId null) settle via webhook/IPN, not sync.
    if (!payment.order.userId || payment.order.userId !== user.id) {
      throw new ForbiddenException();
    }

    if (payment.productLane === 'ESIM' && payment.gateway === PaymentGatewayCode.SEPAY) {
      if (!this.esimSepayPaymentService) {
        throw new BadRequestException('eSIM SePay checkout is not configured');
      }
      return this.esimSepayPaymentService.sync(payment.id);
    }

    if (payment.productLane === 'ESIM' && payment.gateway === PaymentGatewayCode.MEGAPAY) {
      if (!this.esimMegapayPaymentService) {
        throw new BadRequestException('eSIM MegaPay checkout is not configured');
      }
      return this.esimMegapayPaymentService.sync(payment.id);
    }

    if (payment.productLane === 'ESIM' && payment.gateway === PaymentGatewayCode.PAYPAL) {
      if (!this.esimPaypalPaymentService) {
        throw new BadRequestException('eSIM PayPal checkout is not configured');
      }
      return this.esimPaypalPaymentService.sync(payment.id);
    }

    if (payment.gateway === PaymentGatewayCode.PAYPAL) {
      return this.syncPaypalPayment(payment);
    }

    if (payment.status === PaymentRecordStatus.SUCCESS) {
      await this.fulfillmentDispatchService.dispatchOrderFulfillment(
        payment.orderId,
        'webhook',
      );
      return {
        paymentReference: payment.paymentReference,
        status: PaymentRecordStatus.SUCCESS,
        synced: false,
      };
    }

    if (payment.status !== PaymentRecordStatus.PENDING) {
      return {
        paymentReference: payment.paymentReference,
        status: payment.status,
        synced: false,
      };
    }

    const provider = this.providerRegistry.get(payment.gateway);
    const queried = await provider.queryTransaction(payment.paymentReference);
    if (queried.status !== 'SUCCESS') {
      return {
        paymentReference: payment.paymentReference,
        status: queried.status,
        synced: false,
      };
    }

    try {
      assertWebhookAmountMatches(payment.amount, queried.amount);
    } catch (error) {
      this.logger.warn(
        `Gateway sync amount rejected payment=${payment.paymentReference} reason=${
          error instanceof Error ? error.message : 'AMOUNT'
        }`,
      );
      return {
        paymentReference: payment.paymentReference,
        status: PaymentRecordStatus.PENDING,
        synced: false,
      };
    }

    const expired = isWebhookPaymentExpired({
      paymentStatus: payment.status,
      orderPaymentStatus: payment.order.paymentStatus,
      expiresAt: payment.expiresAt,
    });
    if (expired) {
      await this.handleLateSuccessWebhook(payment, {
        amount: new Decimal(queried.amount!).toFixed(2),
        providerTransactionId: null,
        rawPayload: {
          source: 'gateway_query',
          paymentReference: payment.paymentReference,
          queriedAmount: queried.amount,
        },
      });
      return {
        paymentReference: payment.paymentReference,
        status: PaymentRecordStatus.EXPIRED,
        synced: false,
        manualReview: true,
      };
    }

    const gatewayResponse = this.mergeGatewayResponseWithTransactionId(
      {
        source: 'gateway_query',
        paymentReference: payment.paymentReference,
        queriedStatus: queried.status,
        queriedAmount: queried.amount,
      },
      undefined,
    );
    const duplicate = await this.processSuccessWebhookAtomically(
      payment.id,
      payment.orderId,
      gatewayResponse,
    );
    if (!duplicate) {
      await this.paymentAuditService.recordPaymentSuccess({
        orderId: payment.orderId,
        paymentId: payment.id,
        metadata: {
          paymentReference: payment.paymentReference,
          source: 'gateway_query',
        },
      });
      await this.notificationService.notifyPaymentSuccess(payment.orderId);
    }
    const queueJobIds = await this.fulfillmentDispatchService.dispatchOrderFulfillment(
      payment.orderId,
      'webhook',
    );
    this.logger.log(
      `Payment sync enqueued fulfillment orderId=${payment.orderId} paymentReference=${payment.paymentReference} queueJobIds=${queueJobIds.join(',')}`,
    );
    return {
      paymentReference: payment.paymentReference,
      status: PaymentRecordStatus.SUCCESS,
      synced: !duplicate,
    };
  }

  private async syncPaypalPayment(payment: {
    id: string;
    orderId: string;
    paymentReference: string;
    amount: Decimal | number | string;
    status: PaymentRecordStatus;
    expiresAt: Date | null;
    gatewayResponse: unknown;
    order: { paymentStatus: OrderPaymentStatus };
  }) {
    if (payment.status === PaymentRecordStatus.SUCCESS) {
      await this.queuePaypalFulfillmentIfNeeded(payment);
      return {
        paymentReference: payment.paymentReference,
        status: PaymentRecordStatus.SUCCESS,
        synced: false,
      };
    }
    if (payment.status !== PaymentRecordStatus.PENDING) {
      return {
        paymentReference: payment.paymentReference,
        status: payment.status,
        synced: false,
      };
    }

    const outcome = await this.advancePaypal(payment);
    if (outcome.kind === 'pending' || outcome.kind === 'duplicate') {
      return {
        paymentReference: payment.paymentReference,
        status: PaymentRecordStatus.PENDING,
        synced: false,
      };
    }
    if (outcome.kind === 'failed') {
      const fresh = await this.paymentRepository.findById(payment.id);
      await this.processFailedWebhookAtomically(
        payment.id,
        payment.orderId,
        (fresh?.gatewayResponse ?? payment.gatewayResponse) as Prisma.InputJsonValue,
      );
      await this.paymentAuditService.recordPaymentFailed({
        orderId: payment.orderId,
        paymentId: payment.id,
        metadata: { paymentReference: payment.paymentReference, source: 'paypal_capture' },
      });
      return {
        paymentReference: payment.paymentReference,
        status: PaymentRecordStatus.FAILED,
        synced: true,
      };
    }

    assertWebhookAmountMatches(payment.amount, outcome.amount);

    const expired = isWebhookPaymentExpired({
      paymentStatus: payment.status,
      orderPaymentStatus: payment.order.paymentStatus,
      expiresAt: payment.expiresAt,
    });
    if (expired) {
      await this.handleLateSuccessWebhook(payment, {
        amount: new Decimal(outcome.amount).toFixed(2),
        providerTransactionId: outcome.captureId ?? null,
        rawPayload: { source: 'paypal_capture', captureId: outcome.captureId },
      });
      return {
        paymentReference: payment.paymentReference,
        status: PaymentRecordStatus.EXPIRED,
        synced: false,
        manualReview: true,
      };
    }
    const fresh = await this.paymentRepository.findById(payment.id);
    const duplicate = await this.processSuccessWebhookAtomically(
      payment.id,
      payment.orderId,
      (fresh?.gatewayResponse ?? {
        source: 'paypal_capture',
        captureId: outcome.captureId,
      }) as Prisma.InputJsonValue,
    );
    if (!duplicate) {
      await this.paymentAuditService.recordPaymentSuccess({
        orderId: payment.orderId,
        paymentId: payment.id,
        metadata: {
          paymentReference: payment.paymentReference,
          source: 'paypal_capture',
          captureId: outcome.captureId,
        },
      });
      await this.notificationService.notifyPaymentSuccess(payment.orderId);
    }
    await this.queuePaypalFulfillmentIfNeeded(payment);
    return {
      paymentReference: payment.paymentReference,
      status: PaymentRecordStatus.SUCCESS,
      synced: !duplicate,
    };
  }

  private async advancePaypal(payment: {
    id: string;
    paymentReference: string;
    amount: Decimal | number | string;
    status: PaymentRecordStatus;
    gatewayResponse: unknown;
  }): Promise<
    | { kind: 'success'; amount: string; captureId: string }
    | { kind: 'failed' }
    | { kind: 'pending' }
    | { kind: 'duplicate' }
  > {
    let snapshot = readPaypalSnapshot(payment);
    if (snapshot.paymentStatus === 'SUCCESS') return { kind: 'duplicate' };
    let plan = planPaypalSettlement({ snapshot });
    if (plan.step === 'none' && plan.paymentStatus === 'FAILED') {
      await this.persistPaypalPlan(payment, plan);
      return { kind: 'failed' };
    }
    if (plan.step === 'none') return { kind: 'pending' };

    const paypal = this.paypalPort();
    if (!snapshot.paypalOrderId) return { kind: 'pending' };

    const paypalOrderId = snapshot.paypalOrderId;
    if (!paypalOrderId) return { kind: 'pending' };

    let observation: Awaited<ReturnType<PaypalProvider['captureOrder']>> | null = null;
    if (plan.step === 'capture') {
      await this.persistPaypalPlan(payment, { ...plan, captureState: 'CAPTURING', step: 'none', captureApi: false });
      snapshot = { ...snapshot, captureState: 'CAPTURING' };
      observation = await paypal.captureOrder(paypalOrderId, payment.paymentReference);
      if (observation.kind === 'unknown') {
        observation = await paypal.readOrder(paypalOrderId);
        snapshot = { ...snapshot, captureState: 'UNKNOWN' };
      }
      plan = planPaypalSettlement({ snapshot, observation });
    } else {
      observation = await paypal.readOrder(paypalOrderId);
      plan = planPaypalSettlement({ snapshot, observation });
    }

    await this.persistPaypalPlan(payment, plan);
    if (plan.paymentStatus === 'SUCCESS' && plan.captureId) {
      // Prefer gateway capture amount — never settle on local snapshot alone.
      const amount =
        observation?.kind === 'completed' ? observation.amount : snapshot.amount;
      return { kind: 'success', amount, captureId: plan.captureId };
    }
    if (plan.paymentStatus === 'FAILED') return { kind: 'failed' };
    return { kind: 'pending' };
  }

  private paypalPort(): PaypalProvider {
    const provider = this.providerRegistry.get(PaymentGatewayCode.PAYPAL);
    if (typeof (provider as PaypalProvider).captureOrder !== 'function') {
      throw new BadRequestException('PayPal provider is not available');
    }
    return provider as PaypalProvider;
  }

  private async persistPaypalPlan(
    payment: { id: string; gatewayResponse: unknown },
    plan: PaypalPlan,
  ) {
    const current =
      payment.gatewayResponse && typeof payment.gatewayResponse === 'object'
        ? (payment.gatewayResponse as Record<string, unknown>)
        : {};
    const next = {
      ...current,
      captureState: plan.captureState,
      ...(plan.captureId ? { captureId: plan.captureId } : {}),
    };
    await this.paymentRepository.updateGatewayResponse(payment.id, next as Prisma.InputJsonValue);
    payment.gatewayResponse = next;
  }

  private async isEsimOnlyOrder(orderId: string): Promise<boolean> {
    const orderItem = (this.prisma as PrismaService & {
      orderItem?: {
        findMany: (args: unknown) => Promise<Array<{ variant?: { type?: string } | null }>>;
      };
    }).orderItem;
    if (!orderItem?.findMany) return false;
    const items = await orderItem.findMany({
      where: { orderId },
      select: { variant: { select: { type: true } } },
    });
    return items.length > 0 && items.every((item) => item.variant?.type === 'ESIM');
  }

  private async queuePaypalFulfillmentIfNeeded(payment: { id: string; orderId: string }) {
    const fresh = await this.paymentRepository.findById(payment.id);
    if (!fresh || fresh.status !== PaymentRecordStatus.SUCCESS) return;
    const snapshot = readPaypalSnapshot(fresh);
    const raw =
      fresh.gatewayResponse && typeof fresh.gatewayResponse === 'object'
        ? (fresh.gatewayResponse as Record<string, unknown>)
        : {};
    if (snapshot.fulfillmentQueued || raw.fulfillmentSkipped === 'ADMIN_TEST') return;
    const order = await this.prisma.order.findUnique({
      where: { id: fresh.orderId },
      select: { clientTrace: true },
    });
    if (isPersistedAdminTest(order?.clientTrace)) {
      await persistAdminTestFulfillmentSkip(this.prisma as never, fresh.orderId);
      await this.paymentRepository.updateGatewayResponse(fresh.id, {
        ...raw,
        fulfillmentSkipped: 'ADMIN_TEST',
      } as Prisma.InputJsonValue);
      return;
    }
    await this.fulfillmentDispatchService.dispatchOrderFulfillment(fresh.orderId, 'webhook');
    await this.paymentRepository.updateGatewayResponse(fresh.id, {
      ...raw,
      fulfillmentQueued: true,
    } as Prisma.InputJsonValue);
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
    evidence: {
      amount: string;
      providerTransactionId?: string | null;
      rawPayload?: unknown;
    },
  ): Promise<void> {
    const existing =
      payment.gatewayResponse && typeof payment.gatewayResponse === 'object'
        ? (payment.gatewayResponse as Record<string, unknown>)
        : {};

    await this.paymentRepository.recordLateWebhookManualReview(payment.id, {
      ...existing,
      manualReview: true,
      lateWebhookAt: new Date().toISOString(),
      lateWebhookEvidence: {
        amount: evidence.amount,
        providerTransactionId: evidence.providerTransactionId ?? null,
      },
      lateWebhookPayload: (evidence.rawPayload ?? {}) as Prisma.InputJsonValue,
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
    const evidence = readLateWebhookEvidence(gatewayResponse);
    if (!evidence?.amount) {
      throw new BadRequestException(
        'Late webhook evidence amount is required before manual approval',
      );
    }
    assertWebhookAmountMatches(payment.amount, evidence.amount);
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

  /**
   * Account orders require the owner JWT.
   * Guest orders require guestEmail matching orders.guest_email (UUID alone is not ownership).
   */
  private assertPaymentOrderAccess(
    order: { userId: string | null; guestEmail?: string | null; isGuestOrder?: boolean },
    user?: AuthenticatedUser,
    guestEmail?: string,
  ): void {
    if (order.userId) {
      if (!user?.id || user.id !== order.userId) {
        throw new NotFoundException('Order not found');
      }
      return;
    }
    const expected = (order.guestEmail ?? '').trim().toLowerCase();
    const provided = (guestEmail ?? '').trim().toLowerCase();
    if (!expected || !provided || expected !== provided) {
      throw new NotFoundException('Order not found');
    }
  }

  /** SePay remains available as retail backup when MegaPay createPayment fails. */
  private canFailoverRetailToSepay(): boolean {
    try {
      this.providerRegistry.get(PaymentGatewayCode.SEPAY);
      return true;
    } catch {
      return false;
    }
  }
}

function readLateWebhookEvidence(
  gatewayResponse: Record<string, unknown>,
): { amount: string; providerTransactionId: string | null } | null {
  const evidence = gatewayResponse.lateWebhookEvidence;
  if (evidence && typeof evidence === 'object' && !Array.isArray(evidence)) {
    const row = evidence as Record<string, unknown>;
    if (typeof row.amount === 'string' && row.amount.trim()) {
      return {
        amount: row.amount,
        providerTransactionId:
          typeof row.providerTransactionId === 'string' ? row.providerTransactionId : null,
      };
    }
  }
  // Legacy late payloads stored only raw gateway body — still require an explicit amount field.
  const latePayload = gatewayResponse.lateWebhookPayload;
  if (latePayload && typeof latePayload === 'object' && !Array.isArray(latePayload)) {
    const record = latePayload as Record<string, unknown>;
    const amount =
      typeof record.amount === 'string' || typeof record.amount === 'number'
        ? String(record.amount)
        : typeof record.transferAmount === 'string' || typeof record.transferAmount === 'number'
          ? String(record.transferAmount)
          : typeof record.queriedAmount === 'string' || typeof record.queriedAmount === 'number'
            ? String(record.queriedAmount)
            : typeof record.order_amount === 'string' || typeof record.order_amount === 'number'
              ? String(record.order_amount)
              : undefined;
    if (amount?.trim()) {
      return { amount, providerTransactionId: null };
    }
  }
  return null;
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

function readCheckoutClient(
  gatewayResponse: Record<string, unknown>,
): { domain: string; jsUrl: string; cssUrl: string } | undefined {
  const raw = gatewayResponse.checkoutClient;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const client = raw as Record<string, unknown>;
  const domain = typeof client.domain === 'string' ? client.domain : '';
  const jsUrl = typeof client.jsUrl === 'string' ? client.jsUrl : '';
  const cssUrl = typeof client.cssUrl === 'string' ? client.cssUrl : '';
  if (!domain || !jsUrl || !cssUrl) return undefined;
  return { domain, jsUrl, cssUrl };
}

function readDisplayMode(
  gatewayResponse: Record<string, unknown>,
): 'qr_inline' | 'redirect' | 'open_payment' | undefined {
  const mode = gatewayResponse.displayMode;
  if (mode === 'qr_inline' || mode === 'redirect' || mode === 'open_payment') {
    return mode;
  }
  if (gatewayResponse.integrationMode === 'deposit_code_va') return 'qr_inline';
  if (gatewayResponse.integrationMode === 'legacy_qr') return 'qr_inline';
  if (gatewayResponse.integrationMode === 'megapay_pg_v146') return 'open_payment';
  if (gatewayResponse.integrationMode === 'payment_gateway') return 'redirect';
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
  if (upper === 'PAYPAL') {
    return PaymentGatewayCode.PAYPAL;
  }
  throw new BadRequestException(`Unsupported gateway: ${value}`);
}

const PAYPAL_CREATE_IDEMPOTENCY_MS = 6 * 60 * 60 * 1000;

function readGatewayObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readPaypalOrderId(gatewayResponse: unknown): string | null {
  const raw = readGatewayObject(gatewayResponse);
  if (typeof raw.paypalOrderId === 'string' && raw.paypalOrderId.trim()) return raw.paypalOrderId;
  if (typeof raw.providerReference === 'string' && raw.providerReference.trim()) return raw.providerReference;
  return null;
}

function readPaymentUrl(gatewayResponse: unknown): string | null {
  const raw = readGatewayObject(gatewayResponse);
  for (const key of ['paymentUrl', 'approvalUrl', 'checkoutUrl']) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

function adminTestPaypalReady(gatewayResponse: unknown): boolean {
  return Boolean(readPaypalOrderId(gatewayResponse) && readPaymentUrl(gatewayResponse));
}

function esimPaypalCreateIncomplete(payment: {
  gateway: PaymentGatewayCode;
  status: PaymentRecordStatus;
  productLane: string | null;
  gatewayResponse: unknown;
}): boolean {
  return (
    payment.productLane === 'ESIM' &&
    payment.gateway === PaymentGatewayCode.PAYPAL &&
    payment.status === PaymentRecordStatus.PENDING &&
    !readPaypalOrderId(payment.gatewayResponse)
  );
}

function adminTestPaypalCreateIncomplete(payment: {
  gateway: PaymentGatewayCode;
  status: PaymentRecordStatus;
  gatewayResponse: unknown;
}): boolean {
  if (payment.gateway !== PaymentGatewayCode.PAYPAL) return false;
  if (payment.status !== PaymentRecordStatus.PENDING) return false;
  if (readGatewayObject(payment.gatewayResponse).adminTestCreate === 'NEED_MANUAL_REVIEW') return true;
  return !adminTestPaypalReady(payment.gatewayResponse);
}

function mapAdminTestPaypalPayment(
  payment: Payment,
  providerResult?: { paymentUrl: string; rawResponse: Record<string, unknown> },
) {
  const gatewayResponse = readGatewayObject(payment.gatewayResponse);
  const raw = providerResult?.rawResponse ?? gatewayResponse;
  return mapPayment(payment, {
    paymentUrl: providerResult?.paymentUrl ?? readPaymentUrl(gatewayResponse) ?? undefined,
    checkoutUrl:
      (typeof raw.checkoutUrl === 'string' ? raw.checkoutUrl : undefined) ??
      (typeof gatewayResponse.checkoutUrl === 'string' ? gatewayResponse.checkoutUrl : undefined),
    checkoutFormFields: readCheckoutFormFields(raw),
    checkoutClient: readCheckoutClient(raw),
    displayMode: readDisplayMode(raw),
    bankInfo: readBankInfo(raw),
  });
}

function gatewayToWebhookSource(gateway: PaymentGatewayCode): WebhookSource {
  if (gateway === PaymentGatewayCode.MEGAPAY) return WebhookSource.MEGAPAY;
  if (gateway === PaymentGatewayCode.PAYPAL) return WebhookSource.PARTNER;
  return WebhookSource.SEPAY;
}
