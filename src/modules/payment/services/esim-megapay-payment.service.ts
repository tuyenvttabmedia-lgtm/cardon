import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  FinancialTransactionStatus,
  FinancialTransactionType,
  OrderPaymentStatus,
  PaymentGatewayCode,
  PaymentRecordStatus,
  Prisma,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../database/prisma.service';
import { FulfillmentDispatchService } from '../../provider/services/fulfillment-dispatch.service';
import { NotificationService } from '../../notification/services/notification.service';
import { isEsimMegapayMethodCode } from '../../settings/entities/settings.constants';
import { SettingsStoreService } from '../../settings/services/settings-store.service';
import { generatePaymentReference } from '../entities/payment-reference.generator';
import { mapPayment, type PaymentCheckoutClient } from '../entities/payment.mapper';
import { assertWebhookAmountMatches } from '../entities/payment-state.machine';
import { MegaPayProvider } from '../providers/megapay/megapay.provider';
import type { WebhookVerificationResult } from '../providers/payment-provider.interface';

const ESIM_LANE = 'ESIM';

class EsimSettlementLost extends Error {}

export interface EsimMegapayIpnResult {
  success: true;
  outcome: 'SETTLED' | 'DUPLICATE' | 'IGNORED';
  reason?: string;
}

/**
 * eSIM VN MegaPay (VNPAYQR / ZALOPAY) — isolated from retail PaymentService.
 * Uses the same MegaPay PG adapter as cards; settlement mirrors eSIM SePay.
 */
@Injectable()
export class EsimMegapayPaymentService {
  private readonly logger = new Logger(EsimMegapayPaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fulfillmentDispatchService: FulfillmentDispatchService,
    private readonly notificationService: NotificationService,
    private readonly megapayProvider: MegaPayProvider,
    private readonly settingsStore: SettingsStoreService,
  ) {}

  async createFromSnapshot(input: {
    orderId: string;
    gateway: PaymentGatewayCode;
    idempotencyKey: string;
    userId?: string;
  }) {
    if (input.gateway !== PaymentGatewayCode.MEGAPAY) {
      throw new BadRequestException('eSIM MegaPay checkout only accepts MegaPay');
    }
    const order = await this.prisma.order.findFirst({
      where: { id: input.orderId, deletedAt: null },
    });
    if (!order || order.paymentStatus !== OrderPaymentStatus.WAITING_PAYMENT) {
      throw new BadRequestException('Order is not awaiting payment');
    }
    if (order.paymentExpiresAt && order.paymentExpiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Payment window has expired');
    }
    const methodCode = (order.paymentMethodCode ?? '').trim().toUpperCase();
    if (!isEsimMegapayMethodCode(methodCode)) {
      throw new BadRequestException('eSIM MegaPay method must be VNPAYQR or ZALOPAY');
    }
    const armed = this.settingsStore.listEsimMegapayMethodCodes();
    if (!armed.includes(methodCode)) {
      throw new BadRequestException('eSIM MegaPay method is disabled');
    }
    this.assertVndSnapshot(order);
    const amount = new Decimal(order.chargeAmount!.toString());
    const expiresAt = order.paymentExpiresAt ?? new Date(Date.now() + 15 * 60 * 1000);

    try {
      const payment = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`esim-pay:${order.id}`}))`;
        const open = await tx.payment.findFirst({
          where: {
            orderId: order.id,
            productLane: ESIM_LANE,
            gateway: PaymentGatewayCode.MEGAPAY,
            status: { in: [PaymentRecordStatus.PENDING, PaymentRecordStatus.SUCCESS] },
            deletedAt: null,
          },
          orderBy: { createdAt: 'desc' },
        });
        if (open) return open;

        const paymentReference = generatePaymentReference();
        const providerResult = await this.megapayProvider.createPayment({
          paymentReference,
          amount: amount.toFixed(0),
          orderId: order.id,
          gateway: PaymentGatewayCode.MEGAPAY,
          methodCode,
          expiresAt,
        });
        const gatewayResponse = {
          ...providerResult.rawResponse,
          fulfillmentQueued: false,
          productLane: ESIM_LANE,
        } satisfies Prisma.InputJsonObject;
        const created = await tx.payment.create({
          data: {
            orderId: order.id,
            gateway: PaymentGatewayCode.MEGAPAY,
            paymentReference,
            idempotencyKey: input.idempotencyKey,
            amount,
            currency: 'VND',
            productLane: ESIM_LANE,
            fxRateId: order.fxRateId,
            status: PaymentRecordStatus.PENDING,
            expiresAt,
            methodCode,
            settlementType: order.settlementType,
            gatewayResponse,
          },
        });
        await tx.order.update({
          where: { id: order.id },
          data: { paymentId: created.id },
        });
        return created;
      });
      return this.viewMegapayPayment(payment);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.payment.findFirst({
          where: {
            orderId: order.id,
            productLane: ESIM_LANE,
            gateway: PaymentGatewayCode.MEGAPAY,
            status: { in: [PaymentRecordStatus.PENDING, PaymentRecordStatus.SUCCESS] },
            deletedAt: null,
          },
          orderBy: { createdAt: 'desc' },
        });
        if (existing) return this.viewMegapayPayment(existing);
        throw new ConflictException('An eSIM payment is already open for this order');
      }
      throw error;
    }
  }

  private viewMegapayPayment(payment: Parameters<typeof mapPayment>[0]) {
    const raw =
      payment.gatewayResponse && typeof payment.gatewayResponse === 'object' && !Array.isArray(payment.gatewayResponse)
        ? (payment.gatewayResponse as Record<string, unknown>)
        : {};
    return mapPayment(payment, {
      paymentUrl: typeof raw.checkoutUrl === 'string' ? raw.checkoutUrl : undefined,
      checkoutUrl: typeof raw.checkoutUrl === 'string' ? raw.checkoutUrl : undefined,
      checkoutFormFields:
        raw.checkoutFormFields && typeof raw.checkoutFormFields === 'object' && !Array.isArray(raw.checkoutFormFields)
          ? (raw.checkoutFormFields as Record<string, string>)
          : undefined,
      displayMode:
        raw.displayMode === 'qr_inline' || raw.displayMode === 'redirect' || raw.displayMode === 'open_payment'
          ? raw.displayMode
          : 'open_payment',
      checkoutClient: readCheckoutClient(raw.checkoutClient),
    });
  }

  async sync(paymentId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, deletedAt: null },
      include: { order: true },
    });
    if (!payment || payment.productLane !== ESIM_LANE || payment.gateway !== PaymentGatewayCode.MEGAPAY) {
      throw new BadRequestException('eSIM MegaPay payment not found');
    }
    if (payment.status === PaymentRecordStatus.SUCCESS) {
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

    const queried = await this.megapayProvider.queryTransaction(payment.paymentReference);
    if (queried.status !== 'SUCCESS') {
      return {
        paymentReference: payment.paymentReference,
        status: PaymentRecordStatus.PENDING,
        synced: false,
      };
    }
    try {
      assertWebhookAmountMatches(payment.amount, queried.amount);
    } catch (error) {
      this.logger.warn(
        `eSIM MegaPay sync amount rejected ref=${payment.paymentReference} reason=${
          error instanceof Error ? error.message : 'AMOUNT'
        }`,
      );
      return {
        paymentReference: payment.paymentReference,
        status: PaymentRecordStatus.PENDING,
        synced: false,
      };
    }
    const providerTransactionId = queried.paymentReference || payment.paymentReference;
    const settlement = await this.claimSettlement({
      paymentId: payment.id,
      orderId: payment.orderId,
      providerTransactionId,
    });
    if (settlement === 'SETTLED') {
      await this.enqueueAfterCommit(payment.orderId, payment.id);
      await this.notificationService.notifyPaymentSuccess(payment.orderId);
      return {
        paymentReference: payment.paymentReference,
        status: PaymentRecordStatus.SUCCESS,
        synced: true,
      };
    }
    if (settlement === 'DUPLICATE') {
      await this.enqueueAfterCommit(payment.orderId, payment.id);
      return {
        paymentReference: payment.paymentReference,
        status: PaymentRecordStatus.SUCCESS,
        synced: false,
      };
    }
    return {
      paymentReference: payment.paymentReference,
      status: payment.status,
      synced: false,
    };
  }

  async handleVerifiedWebhook(input: {
    paymentId: string;
    verification: WebhookVerificationResult;
  }): Promise<EsimMegapayIpnResult> {
    const payment = await this.prisma.payment.findFirst({
      where: { id: input.paymentId, deletedAt: null },
    });
    if (!payment || payment.productLane !== ESIM_LANE || payment.gateway !== PaymentGatewayCode.MEGAPAY) {
      return { success: true, outcome: 'IGNORED', reason: 'UNKNOWN_PAYMENT' };
    }
    if (input.verification.status === 'PENDING') {
      return { success: true, outcome: 'IGNORED', reason: 'PENDING' };
    }
    if (input.verification.status === 'FAILED') {
      await this.prisma.payment.updateMany({
        where: { id: payment.id, status: PaymentRecordStatus.PENDING, deletedAt: null },
        data: { status: PaymentRecordStatus.FAILED },
      });
      return { success: true, outcome: 'IGNORED', reason: 'FAILED' };
    }
    try {
      assertWebhookAmountMatches(payment.amount, input.verification.amount);
    } catch {
      this.logger.warn(`eSIM MegaPay IPN amount mismatch ref=${payment.paymentReference}`);
      return { success: true, outcome: 'IGNORED', reason: 'AMOUNT_MISMATCH' };
    }
    const providerTransactionId =
      input.verification.providerTransactionId?.trim() ||
      String(input.verification.rawPayload?.trxId ?? '').trim() ||
      payment.paymentReference;
    const settlement = await this.claimSettlement({
      paymentId: payment.id,
      orderId: payment.orderId,
      providerTransactionId,
    });
    if (settlement === 'SETTLED') {
      await this.enqueueAfterCommit(payment.orderId, payment.id);
      await this.notificationService.notifyPaymentSuccess(payment.orderId);
      return { success: true, outcome: 'SETTLED' };
    }
    if (settlement === 'DUPLICATE') {
      await this.enqueueAfterCommit(payment.orderId, payment.id);
      return { success: true, outcome: 'DUPLICATE' };
    }
    this.logger.warn(`eSIM MegaPay IPN ${settlement} ref=${payment.paymentReference}`);
    return { success: true, outcome: 'IGNORED', reason: settlement };
  }

  private assertVndSnapshot(order: {
    catalogCurrency: string | null;
    catalogAmount: Decimal | null;
    chargeCurrency: string | null;
    chargeAmount: Decimal | null;
  }): void {
    const charge = order.chargeAmount ? new Decimal(order.chargeAmount.toString()) : null;
    const whole = charge?.equals(charge.toDecimalPlaces(0)) ?? false;
    if (
      order.catalogCurrency !== 'VND' ||
      order.chargeCurrency !== 'VND' ||
      order.catalogAmount == null ||
      charge == null ||
      !charge.greaterThan(0) ||
      !whole
    ) {
      throw new BadRequestException('eSIM price snapshot is missing or is not VND');
    }
  }

  private async enqueueAfterCommit(orderId: string, paymentId: string): Promise<void> {
    const claimed = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({
        where: { id: paymentId, deletedAt: null },
      });
      if (!payment || payment.status !== PaymentRecordStatus.SUCCESS) return false;
      const raw = readGateway(payment.gatewayResponse);
      if (raw.fulfillmentQueued === true) return false;
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          gatewayResponse: { ...raw, fulfillmentQueued: true } as Prisma.InputJsonObject,
        },
      });
      return true;
    });
    if (!claimed) return;
    try {
      await this.fulfillmentDispatchService.dispatchOrderFulfillment(orderId);
    } catch (error) {
      const payment = await this.prisma.payment.findFirst({
        where: { id: paymentId, deletedAt: null },
      });
      const raw = readGateway(payment?.gatewayResponse);
      await this.prisma.payment.update({
        where: { id: paymentId },
        data: {
          gatewayResponse: {
            ...raw,
            fulfillmentQueued: false,
            fulfillmentDispatchFailed: true,
          } as Prisma.InputJsonObject,
        },
      });
      throw error;
    }
  }

  private async claimSettlement(input: {
    paymentId: string;
    orderId: string;
    providerTransactionId: string;
  }): Promise<'SETTLED' | 'DUPLICATE' | 'LOST' | 'EXPIRED'> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`esim-pay:${input.orderId}`}))`;
        const payment = await tx.payment.findFirst({
          where: { id: input.paymentId, deletedAt: null },
          include: { order: true },
        });
        if (!payment || payment.productLane !== ESIM_LANE) return 'LOST';
        if (
          payment.status === PaymentRecordStatus.SUCCESS &&
          payment.gatewayTransactionId === input.providerTransactionId
        ) {
          return 'DUPLICATE';
        }
        if (payment.status === PaymentRecordStatus.SUCCESS) return 'LOST';
        const order = payment.order;
        const expired =
          order.paymentStatus !== OrderPaymentStatus.WAITING_PAYMENT ||
          (order.paymentExpiresAt != null && order.paymentExpiresAt.getTime() <= Date.now()) ||
          (payment.expiresAt != null && payment.expiresAt.getTime() <= Date.now());
        if (expired) return 'EXPIRED';
        const existingTx = await tx.payment.findFirst({
          where: {
            gatewayTransactionId: input.providerTransactionId,
            id: { not: payment.id },
            deletedAt: null,
          },
          select: { id: true },
        });
        if (existingTx) return 'LOST';
        const claimed = await tx.payment.updateMany({
          where: {
            id: payment.id,
            status: PaymentRecordStatus.PENDING,
            productLane: ESIM_LANE,
            deletedAt: null,
          },
          data: {
            status: PaymentRecordStatus.SUCCESS,
            paidAt: new Date(),
            gatewayTransactionId: input.providerTransactionId,
          },
        });
        if (claimed.count !== 1) return 'LOST';
        const paid = await tx.order.updateMany({
          where: {
            id: input.orderId,
            paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
            deletedAt: null,
          },
          data: {
            paymentStatus: OrderPaymentStatus.PAID,
            paymentId: payment.id,
          },
        });
        if (paid.count !== 1) throw new EsimSettlementLost();
        await tx.financialTransaction.updateMany({
          where: {
            type: FinancialTransactionType.B2C_CHECKOUT,
            status: { in: [FinancialTransactionStatus.PENDING, FinancialTransactionStatus.FAILED] },
            deletedAt: null,
            orders: { some: { id: input.orderId } },
          },
          data: { status: FinancialTransactionStatus.COMPLETED },
        });
        return 'SETTLED';
      });
    } catch (error) {
      if (error instanceof EsimSettlementLost) return 'LOST';
      throw error;
    }
  }
}

function readGateway(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readCheckoutClient(value: unknown): PaymentCheckoutClient | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.domain !== 'string' ||
    typeof raw.jsUrl !== 'string' ||
    typeof raw.cssUrl !== 'string'
  ) {
    return undefined;
  }
  return { domain: raw.domain, jsUrl: raw.jsUrl, cssUrl: raw.cssUrl };
}
