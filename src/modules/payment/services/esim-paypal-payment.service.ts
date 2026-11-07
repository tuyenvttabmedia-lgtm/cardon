import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  FinancialTransactionStatus,
  FinancialTransactionType,
  Order,
  OrderPaymentStatus,
  Payment,
  PaymentGatewayCode,
  PaymentRecordStatus,
  Prisma,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../database/prisma.service';
import { FulfillmentDispatchService } from '../../provider/services/fulfillment-dispatch.service';
import { NotificationService } from '../../notification/services/notification.service';
import { generatePaymentReference } from '../entities/payment-reference.generator';
import { mapPayment } from '../entities/payment.mapper';
import { readOrderCheckoutLocale } from '../entities/storefront-checkout-url';
import { CreateProviderPaymentParams, ProviderPaymentResult } from '../providers/payment-provider.interface';
import { PaypalProvider } from '../providers/paypal/paypal.provider';
import {
  evaluateEsimPaypalCapture,
  parsePaypalWebhook,
  planPaypalSettlement,
  readPaypalSnapshot,
  type PaypalObservation,
  type PaypalPlan,
} from '../providers/paypal/paypal.rules';
import { evaluateEsimUsdPaypalSnapshot } from '../providers/paypal/esim-paypal-snapshot.rules';

const ESIM_LANE = 'ESIM';

class EsimSettlementLost extends Error {}

export type EsimPaypalWebhookOutcome = 'SETTLED' | 'DUPLICATE' | 'IGNORED';

@Injectable()
export class EsimPaypalPaymentService {
  private readonly logger = new Logger(EsimPaypalPaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paypal: PaypalProvider,
    private readonly fulfillmentDispatchService: FulfillmentDispatchService,
    private readonly notificationService: NotificationService,
  ) {}

  async createFromSnapshot(input: { orderId: string; idempotencyKey: string; userId?: string }) {
    const order = await this.requirePayableOrder(input.orderId);
    const existing = await this.findOpenPayment(order.id);
    const amount = await this.requireUsdSnapshot(order);
    if (existing) {
      const snap = readPaypalSnapshot(existing);
      const url = this.readStoredApprovalUrl(existing);
      if (snap.paypalOrderId && url) {
        this.assertStoredUsdCharge(order, existing);
        return this.view(existing);
      }
      return this.ensurePaypalOrder(order, existing, amount);
    }

    const expiresAt = order.paymentExpiresAt ?? new Date(Date.now() + 15 * 60 * 1000);
    let payment: Payment;
    try {
      payment = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`esim-pay:${order.id}`}))`;
        const open = await tx.payment.findFirst({
          where: {
            orderId: order.id,
            productLane: ESIM_LANE,
            status: { in: [PaymentRecordStatus.PENDING, PaymentRecordStatus.SUCCESS] },
            deletedAt: null,
          },
        });
        if (open) return open;
        const created = await tx.payment.create({
          data: {
            orderId: order.id,
            gateway: PaymentGatewayCode.PAYPAL,
            paymentReference: generatePaymentReference(),
            idempotencyKey: input.idempotencyKey,
            amount: new Decimal(amount),
            currency: 'USD',
            productLane: ESIM_LANE,
            fxRateId: order.fxRateId,
            status: PaymentRecordStatus.PENDING,
            expiresAt,
            methodCode: order.paymentMethodCode,
            settlementType: order.settlementType,
            gatewayResponse: { captureState: 'CREATED', fulfillmentQueued: false },
          },
        });
        await tx.order.update({
          where: { id: order.id },
          data: { paymentId: created.id },
        });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An eSIM payment is already open for this order');
      }
      throw error;
    }
    return this.ensurePaypalOrder(order, payment, amount);
  }

  async completeOpenPayment(paymentId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, deletedAt: null },
    });
    if (!payment || payment.productLane !== ESIM_LANE || payment.gateway !== PaymentGatewayCode.PAYPAL) {
      throw new BadRequestException('eSIM PayPal payment was not found');
    }
    const order = await this.requirePayableOrder(payment.orderId);
    const amount = await this.requireUsdSnapshot(order);
    if (new Decimal(payment.amount.toString()).toFixed(2) !== amount) {
      throw new BadRequestException('eSIM PayPal amount does not match the USD snapshot');
    }
    return this.ensurePaypalOrder(order, payment, amount);
  }

  async handleVerifiedWebhook(input: {
    paymentId: string;
    payload: unknown;
  }): Promise<{ outcome: EsimPaypalWebhookOutcome; reason?: string }> {
    const payment = await this.prisma.payment.findFirst({
      where: { id: input.paymentId, deletedAt: null },
      include: { order: true },
    });
    if (!payment || payment.productLane !== ESIM_LANE || payment.gateway !== PaymentGatewayCode.PAYPAL) {
      return { outcome: 'IGNORED', reason: 'LANE' };
    }
    const parsed = parsePaypalWebhook(input.payload);
    if (parsed?.observation.kind === 'approved' || parsed?.eventType === 'CHECKOUT.ORDER.APPROVED') {
      const stored = readPaypalSnapshot(payment).paypalOrderId;
      if (parsed.orderId && stored && parsed.orderId !== stored) {
        await this.recordMismatch(payment.id, 'ORDER_ID');
        return { outcome: 'IGNORED', reason: 'ORDER_ID' };
      }
      return this.finishFromGateway(payment);
    }
    if (parsed?.observation.kind === 'declined' || parsed?.observation.kind === 'voided') {
      await this.markFailed(payment.id, parsed.observation.kind === 'voided' ? 'CANCELLED' : 'DECLINED');
      return { outcome: 'IGNORED', reason: 'CAPTURE_FAILED' };
    }

    const decision = evaluateEsimPaypalCapture({
      payload: input.payload,
      storedOrderId: readPaypalSnapshot(payment).paypalOrderId,
      expectedAmount: new Decimal(payment.amount.toString()).toFixed(2),
      paymentCurrency: payment.currency,
      productLane: payment.productLane,
      gateway: payment.gateway,
    });
    if (!decision.ok) {
      await this.recordMismatch(payment.id, decision.reason);
      this.logger.warn(`eSIM PayPal webhook mismatch ${decision.reason} reference=${payment.paymentReference}`);
      return { outcome: 'IGNORED', reason: decision.reason };
    }
    return this.settleCaptured(payment, decision.captureId);
  }

  async sync(paymentId: string): Promise<{
    paymentReference: string;
    status: PaymentRecordStatus;
    synced: boolean;
  }> {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, deletedAt: null },
      include: { order: true },
    });
    if (!payment || payment.productLane !== ESIM_LANE || payment.gateway !== PaymentGatewayCode.PAYPAL) {
      throw new BadRequestException('eSIM PayPal payment was not found');
    }
    if (payment.status === PaymentRecordStatus.SUCCESS) {
      await this.enqueueAfterCommit(payment.orderId, payment.id);
      return { paymentReference: payment.paymentReference, status: payment.status, synced: false };
    }
    if (payment.status !== PaymentRecordStatus.PENDING) {
      return { paymentReference: payment.paymentReference, status: payment.status, synced: false };
    }
    const result = await this.finishFromGateway(payment);
    const fresh = await this.prisma.payment.findFirst({ where: { id: payment.id, deletedAt: null } });
    return {
      paymentReference: payment.paymentReference,
      status: fresh?.status ?? payment.status,
      synced: result.outcome === 'SETTLED',
    };
  }

  private async finishFromGateway(payment: Payment & { order: Order }): Promise<{
    outcome: EsimPaypalWebhookOutcome;
    reason?: string;
  }> {
    const observed = await this.observe(payment);
    if (observed.plan.paymentStatus === 'FAILED') {
      await this.markFailed(payment.id, observed.plan.captureState === 'CANCELLED' ? 'CANCELLED' : 'DECLINED');
      return { outcome: 'IGNORED', reason: 'CAPTURE_FAILED' };
    }
    if (observed.plan.paymentStatus !== 'SUCCESS' || !observed.plan.captureId) {
      return { outcome: 'IGNORED', reason: 'PENDING' };
    }
    const observation = observed.observation;
    if (!observation || observation.kind !== 'completed' || observation.currency.trim().toUpperCase() !== 'USD') {
      await this.recordMismatch(payment.id, 'CURRENCY');
      return { outcome: 'IGNORED', reason: 'CURRENCY' };
    }
    if (new Decimal(observation.amount).toFixed(2) !== new Decimal(payment.amount.toString()).toFixed(2)) {
      await this.recordMismatch(payment.id, 'AMOUNT');
      return { outcome: 'IGNORED', reason: 'AMOUNT' };
    }
    return this.settleCaptured(payment, observed.plan.captureId);
  }

  private async settleCaptured(
    payment: Payment & { order: Order },
    captureId: string,
  ): Promise<{ outcome: EsimPaypalWebhookOutcome; reason?: string }> {
    if (
      payment.status === PaymentRecordStatus.SUCCESS &&
      payment.gatewayTransactionId === captureId
    ) {
      await this.enqueueAfterCommit(payment.orderId, payment.id);
      return { outcome: 'DUPLICATE' };
    }
    const expired = this.paymentWindowClosed(payment);
    if (expired) {
      await this.noteReconciliation(payment.id, captureId);
      return { outcome: 'IGNORED', reason: 'EXPIRED' };
    }
    let settlement: 'SETTLED' | 'DUPLICATE' | 'LOST' | 'EXPIRED';
    try {
      settlement = await this.claimSettlement({
        paymentId: payment.id,
        orderId: payment.orderId,
        captureId,
      });
    } catch (error) {
      await this.noteReconciliation(payment.id, captureId);
      throw error;
    }
    if (settlement === 'LOST' || settlement === 'EXPIRED') {
      await this.noteReconciliation(payment.id, captureId);
      this.logger.warn(`eSIM PayPal settlement ${settlement} reference=${payment.paymentReference}`);
      return { outcome: 'IGNORED', reason: settlement };
    }
    await this.enqueueAfterCommit(payment.orderId, payment.id);
    if (settlement === 'SETTLED') {
      await this.notificationService.notifyPaymentSuccess(payment.orderId);
    }
    return { outcome: settlement };
  }

  private async observe(payment: Payment): Promise<{ plan: PaypalPlan; observation: PaypalObservation | null }> {
    let snapshot = readPaypalSnapshot(payment);
    let plan = planPaypalSettlement({ snapshot });
    if (plan.step === 'none' || !snapshot.paypalOrderId) {
      return { plan, observation: null };
    }
    const paypalOrderId = snapshot.paypalOrderId;
    let observation: PaypalObservation;
    if (plan.step === 'capture') {
      await this.persistPlan(payment, { ...plan, captureState: 'CAPTURING', step: 'none', captureApi: false });
      snapshot = { ...snapshot, captureState: 'CAPTURING' };
      observation = await this.paypal.captureOrder(paypalOrderId, payment.paymentReference);
      if (observation.kind === 'unknown') {
        observation = await this.paypal.readOrder(paypalOrderId);
        snapshot = { ...snapshot, captureState: 'UNKNOWN' };
      }
      plan = planPaypalSettlement({ snapshot, observation });
    } else {
      observation = await this.paypal.readOrder(paypalOrderId);
      plan = planPaypalSettlement({ snapshot, observation });
    }
    await this.persistPlan(payment, plan);
    return { plan, observation };
  }

  private readStoredApprovalUrl(payment: Payment): string | null {
    const raw = readGateway(payment.gatewayResponse);
    const url = typeof raw.paymentUrl === 'string' ? raw.paymentUrl : typeof raw.approvalUrl === 'string' ? raw.approvalUrl : null;
    if (!url) return null;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' && parsed.hostname.endsWith('paypal.com') ? url : null;
    } catch {
      return null;
    }
  }

  private async ensurePaypalOrder(order: Order, payment: Payment, amount: string) {
    const stored = readPaypalSnapshot(payment).paypalOrderId;
    const existingUrl = this.readStoredApprovalUrl(payment);
    if (stored && existingUrl) {
      return this.view(payment);
    }
    if (new Decimal(payment.amount.toString()).toFixed(2) !== amount) {
      throw new BadRequestException('eSIM PayPal amount does not match the USD snapshot');
    }
    const params: CreateProviderPaymentParams = {
      paymentReference: payment.paymentReference,
      amount,
      orderId: order.id,
      gateway: PaymentGatewayCode.PAYPAL,
      expiresAt: payment.expiresAt ?? undefined,
      guestEmail: order.isGuestOrder ? order.guestEmail : null,
      methodCode: order.paymentMethodCode,
      currency: 'USD',
      locale: readOrderCheckoutLocale(order.clientTrace),
    };
    let created: ProviderPaymentResult;
    try {
      created = await this.paypal.createPayment(params);
    } catch (error) {
      this.logger.warn(`eSIM PayPal create failed reference=${payment.paymentReference}`);
      throw error;
    }
    if (!created.providerReference) {
      throw new BadRequestException('PayPal order id is missing');
    }
    const current = readGateway(payment.gatewayResponse);
    const saved = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        gatewayResponse: {
          ...current,
          paypalOrderId: created.providerReference,
          providerReference: created.providerReference,
          paymentUrl: created.paymentUrl,
          approvalUrl: created.paymentUrl,
          captureState: 'CREATED',
          fulfillmentQueued: false,
          currency: 'USD',
        } as Prisma.InputJsonObject,
      },
    });
    return this.view(saved);
  }

  private view(payment: Payment) {
    const raw = readGateway(payment.gatewayResponse);
    const paymentUrl = typeof raw.paymentUrl === 'string' ? raw.paymentUrl : undefined;
    return mapPayment(payment, {
      paymentUrl,
      checkoutUrl: paymentUrl,
      displayMode: 'redirect',
    });
  }

  private assertStoredUsdCharge(order: Order, payment: Payment): void {
    if ((order.chargeCurrency ?? '').trim().toUpperCase() !== 'USD' || order.chargeAmount == null) {
      throw new BadRequestException('eSIM PayPal snapshot rejected: MISSING_SNAPSHOT');
    }
    const charge = new Decimal(order.chargeAmount.toString());
    if (!charge.greaterThan(0) || charge.toFixed(2) !== new Decimal(payment.amount.toString()).toFixed(2)) {
      throw new BadRequestException('eSIM PayPal amount does not match the USD snapshot');
    }
  }

  private async requirePayableOrder(orderId: string): Promise<Order> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
    });
    if (!order || order.paymentStatus !== OrderPaymentStatus.WAITING_PAYMENT) {
      throw new BadRequestException('Order is not awaiting payment');
    }
    if (order.paymentGateway !== PaymentGatewayCode.PAYPAL) {
      throw new BadRequestException('eSIM PayPal checkout only accepts a PayPal order');
    }
    if (order.paymentExpiresAt && order.paymentExpiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Payment window has expired');
    }
    return order;
  }

  private async requireUsdSnapshot(order: Order): Promise<string> {
    const fx = order.fxRateId
      ? await this.prisma.fxRate.findFirst({
          where: { id: order.fxRateId },
          include: { source: true },
        })
      : null;
    const decision = evaluateEsimUsdPaypalSnapshot({
      chargeCurrency: order.chargeCurrency,
      chargeAmount: order.chargeAmount,
      fxRateId: order.fxRateId,
      fxRateValue: order.fxRateValue,
      fxAsOf: order.fxAsOf,
      fx: fx
        ? {
            status: fx.status,
            effectiveTo: fx.effectiveTo,
            observedAt: fx.observedAt,
            effectiveFrom: fx.effectiveFrom,
            maxStalenessSeconds: fx.source.maxStalenessSeconds,
          }
        : null,
      now: new Date(),
    });
    if (!decision.ok) {
      throw new BadRequestException(`eSIM PayPal snapshot rejected: ${decision.reason}`);
    }
    return decision.amount;
  }

  private findOpenPayment(orderId: string) {
    return this.prisma.payment.findFirst({
      where: {
        orderId,
        productLane: ESIM_LANE,
        gateway: PaymentGatewayCode.PAYPAL,
        status: { in: [PaymentRecordStatus.PENDING, PaymentRecordStatus.SUCCESS] },
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private paymentWindowClosed(payment: Payment & { order: Order }): boolean {
    const now = Date.now();
    return (
      payment.order.paymentStatus !== OrderPaymentStatus.WAITING_PAYMENT ||
      (payment.order.paymentExpiresAt != null && payment.order.paymentExpiresAt.getTime() <= now) ||
      (payment.expiresAt != null && payment.expiresAt.getTime() <= now)
    );
  }

  private async claimSettlement(input: {
    paymentId: string;
    orderId: string;
    captureId: string;
  }): Promise<'SETTLED' | 'DUPLICATE' | 'LOST' | 'EXPIRED'> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`esim-pay:${input.orderId}`}))`;
        const payment = await tx.payment.findFirst({
          where: { id: input.paymentId, deletedAt: null },
          include: { order: true },
        });
        if (!payment || payment.productLane !== ESIM_LANE || payment.gateway !== PaymentGatewayCode.PAYPAL) {
          return 'LOST';
        }
        if (
          payment.status === PaymentRecordStatus.SUCCESS &&
          payment.gatewayTransactionId === input.captureId
        ) {
          return 'DUPLICATE';
        }
        if (payment.status === PaymentRecordStatus.SUCCESS) return 'LOST';
        const expired =
          payment.order.paymentStatus !== OrderPaymentStatus.WAITING_PAYMENT ||
          (payment.order.paymentExpiresAt != null && payment.order.paymentExpiresAt.getTime() <= Date.now()) ||
          (payment.expiresAt != null && payment.expiresAt.getTime() <= Date.now());
        if (expired) return 'EXPIRED';
        const captureOwner = await tx.payment.findFirst({
          where: {
            gateway: PaymentGatewayCode.PAYPAL,
            gatewayTransactionId: input.captureId,
            id: { not: payment.id },
            deletedAt: null,
          },
          select: { id: true },
        });
        if (captureOwner) return 'LOST';
        const previous = readGateway(payment.gatewayResponse);
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
            gatewayTransactionId: input.captureId,
            gatewayResponse: {
              ...previous,
              captureId: input.captureId,
              captureState: 'CAPTURED',
              reconciliationRequired: false,
            } as Prisma.InputJsonObject,
          },
        });
        if (claimed.count !== 1) {
          const again = await tx.payment.findFirst({ where: { id: payment.id, deletedAt: null } });
          if (again?.status === PaymentRecordStatus.SUCCESS && again.gatewayTransactionId === input.captureId) {
            return 'DUPLICATE';
          }
          return 'LOST';
        }
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

  private async enqueueAfterCommit(orderId: string, paymentId: string): Promise<void> {
    const claimed = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`esim-pay:${orderId}`}))`;
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
      const payment = await this.prisma.payment.findFirst({ where: { id: paymentId, deletedAt: null } });
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

  private async persistPlan(payment: Payment, plan: PaypalPlan): Promise<void> {
    const current = readGateway(payment.gatewayResponse);
    const next = {
      ...current,
      captureState: plan.captureState,
      ...(plan.captureId ? { captureId: plan.captureId } : {}),
    };
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { gatewayResponse: next as Prisma.InputJsonObject },
    });
    payment.gatewayResponse = next as Prisma.JsonValue;
  }

  private async markFailed(paymentId: string, captureState: 'DECLINED' | 'CANCELLED'): Promise<void> {
    const current = await this.prisma.payment.findFirst({
      where: { id: paymentId, status: PaymentRecordStatus.PENDING, deletedAt: null },
    });
    if (!current) return;
    const previous = readGateway(current.gatewayResponse);
    await this.prisma.payment.updateMany({
      where: { id: paymentId, status: PaymentRecordStatus.PENDING, productLane: ESIM_LANE, deletedAt: null },
      data: {
        status: PaymentRecordStatus.FAILED,
        gatewayResponse: { ...previous, captureState } as Prisma.InputJsonObject,
      },
    });
  }

  private async recordMismatch(paymentId: string, reason: string): Promise<void> {
    const current = await this.prisma.payment.findFirst({
      where: { id: paymentId, status: PaymentRecordStatus.PENDING, deletedAt: null },
    });
    if (!current) return;
    const previous = readGateway(current.gatewayResponse);
    await this.prisma.payment.updateMany({
      where: { id: paymentId, status: PaymentRecordStatus.PENDING, deletedAt: null },
      data: {
        gatewayResponse: { ...previous, settlementMismatch: reason } as Prisma.InputJsonObject,
      },
    });
  }

  private async noteReconciliation(paymentId: string, captureId: string): Promise<void> {
    const current = await this.prisma.payment.findFirst({
      where: { id: paymentId, deletedAt: null },
    });
    if (!current || current.status === PaymentRecordStatus.SUCCESS) return;
    const previous = readGateway(current.gatewayResponse);
    const amount = new Decimal(current.amount.toString()).toFixed(2);
    await this.prisma.payment.updateMany({
      where: { id: paymentId, status: { not: PaymentRecordStatus.SUCCESS }, deletedAt: null },
      data: {
        gatewayResponse: {
          ...previous,
          captureId,
          captureState: previous.captureState ?? 'CAPTURED',
          reconciliationRequired: true,
          reconciliationReason: 'CAPTURED_UNSETTLED',
          // Enter the same manual-review queue as retail late webhooks; approve requires amount evidence.
          manualReview: true,
          lateWebhookAt: new Date().toISOString(),
          lateWebhookEvidence: {
            amount,
            providerTransactionId: captureId,
          },
        } as Prisma.InputJsonObject,
      },
    });
  }
}

function readGateway(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
