import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
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
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../database/prisma.service';
import { FulfillmentDispatchService } from '../../provider/services/fulfillment-dispatch.service';
import { NotificationService } from '../../notification/services/notification.service';
import { mapPayment } from '../entities/payment.mapper';
import { readOrderCheckoutLocale, storefrontCheckoutUrl } from '../entities/storefront-checkout-url';
import {
  buildEsimSepayCheckoutForm,
  secretsMatch,
} from '../providers/sepay/esim-sepay-checkout';
import { evaluateEsimSepayIpn } from '../providers/sepay/esim-sepay-ipn';
import { SepayConfigService } from '../providers/sepay/sepay.config';
import { readEsimSepayGatewayConfig } from '../providers/sepay/esim-sepay-sandbox.config';
import { querySepayPgOrder } from '../providers/sepay/sepay.pg';
import { assertWebhookAmountMatches } from '../entities/payment-state.machine';

const ESIM_LANE = 'ESIM';

class EsimSettlementLost extends Error {}

export interface EsimSepayIpnResult {
  success: true;
  outcome: 'SETTLED' | 'DUPLICATE' | 'IGNORED';
  reason?: string;
}

@Injectable()
export class EsimSepayPaymentService {
  private readonly logger = new Logger(EsimSepayPaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fulfillmentDispatchService: FulfillmentDispatchService,
    private readonly notificationService: NotificationService,
    private readonly sepayConfig: SepayConfigService,
  ) {}

  private gatewayConfig() {
    const gateway = this.sepayConfig.getPaymentGateway();
    if (!gateway.enabled) {
      return { ok: false as const, reason: 'NOT_CONFIGURED' as const };
    }
    return readEsimSepayGatewayConfig({
      environment: gateway.environment,
      merchantId: gateway.merchantId,
      merchantSecret: gateway.merchantSecretKey,
      ipnSecret: gateway.ipnSecretKey,
      publicUrl: gateway.publicUrl,
    });
  }

  async createFromSnapshot(input: {
    orderId: string;
    gateway: PaymentGatewayCode;
    idempotencyKey: string;
    userId?: string;
  }) {
    if (input.gateway !== PaymentGatewayCode.SEPAY) {
      throw new BadRequestException('eSIM checkout only accepts SePay VND');
    }
    const configResult = this.gatewayConfig();
    if (!configResult.ok) {
      throw new BadRequestException('eSIM SePay checkout is not configured');
    }
    const config = configResult.config;
    const order = await this.prisma.order.findFirst({
      where: { id: input.orderId, deletedAt: null },
    });
    if (!order || order.paymentStatus !== OrderPaymentStatus.WAITING_PAYMENT) {
      throw new BadRequestException('Order is not awaiting payment');
    }
    if (order.paymentExpiresAt && order.paymentExpiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Payment window has expired');
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
            gateway: PaymentGatewayCode.SEPAY,
            status: { in: [PaymentRecordStatus.PENDING, PaymentRecordStatus.SUCCESS] },
            deletedAt: null,
          },
          orderBy: { createdAt: 'desc' },
        });
        if (open) return open;

        const paymentReference = `ESIM${randomBytes(8).toString('hex').toUpperCase()}`;
        const locale = readOrderCheckoutLocale(order.clientTrace);
        const fields = {
          order_amount: amount.toFixed(0),
          merchant: config.merchantId,
          currency: 'VND',
          operation: 'PURCHASE',
          order_description: `CardOn eSIM ${order.orderCode}`,
          order_invoice_number: paymentReference,
          customer_id: input.userId ?? order.userId ?? '',
          payment_method: 'BANK_TRANSFER',
          // Same landing as retail SePay: order page + payment flag. Not /checkout/result (MegaPay).
          success_url: storefrontCheckoutUrl(config.publicUrl, locale, `/orders/${order.id}`, {
            payment: 'success',
          }),
          error_url: storefrontCheckoutUrl(config.publicUrl, locale, `/orders/${order.id}`, {
            payment: 'error',
          }),
          cancel_url: storefrontCheckoutUrl(config.publicUrl, locale, `/orders/${order.id}`, {
            payment: 'cancel',
          }),
        };
        const checkoutFormFields = buildEsimSepayCheckoutForm(fields, config.merchantSecret);
        const gatewayResponse = {
          integrationMode: 'esim_payment_gateway',
          environment: 'sandbox',
          checkoutUrl: config.checkoutUrl,
          checkoutFormFields,
          displayMode: 'redirect',
        } satisfies Prisma.InputJsonObject;
        const created = await tx.payment.create({
          data: {
            orderId: order.id,
            gateway: PaymentGatewayCode.SEPAY,
            paymentReference,
            idempotencyKey: input.idempotencyKey,
            amount,
            currency: 'VND',
            productLane: ESIM_LANE,
            fxRateId: order.fxRateId,
            status: PaymentRecordStatus.PENDING,
            expiresAt,
            methodCode: order.paymentMethodCode,
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
      return this.viewSepayPayment(payment, config.checkoutUrl);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.payment.findFirst({
          where: {
            orderId: order.id,
            productLane: ESIM_LANE,
            gateway: PaymentGatewayCode.SEPAY,
            status: { in: [PaymentRecordStatus.PENDING, PaymentRecordStatus.SUCCESS] },
            deletedAt: null,
          },
          orderBy: { createdAt: 'desc' },
        });
        if (existing) return this.viewSepayPayment(existing, config.checkoutUrl);
        throw new ConflictException('An eSIM payment is already open for this order');
      }
      throw error;
    }
  }

  private viewSepayPayment(
    payment: Parameters<typeof mapPayment>[0],
    fallbackCheckoutUrl: string,
  ) {
    const raw =
      payment.gatewayResponse && typeof payment.gatewayResponse === 'object' && !Array.isArray(payment.gatewayResponse)
        ? (payment.gatewayResponse as Record<string, unknown>)
        : {};
    const checkoutUrl =
      typeof raw.checkoutUrl === 'string' && raw.checkoutUrl.trim() ? raw.checkoutUrl : fallbackCheckoutUrl;
    const checkoutFormFields =
      raw.checkoutFormFields && typeof raw.checkoutFormFields === 'object' && !Array.isArray(raw.checkoutFormFields)
        ? (raw.checkoutFormFields as Record<string, string>)
        : undefined;
    if (!checkoutFormFields || Object.keys(checkoutFormFields).length === 0) {
      throw new BadRequestException('eSIM SePay checkout form is missing');
    }
    return mapPayment(payment, {
      checkoutUrl,
      checkoutFormFields,
      displayMode: 'redirect',
    });
  }

  /**
   * Return-URL / poll reconcile. Queries SePay PG; never trusts ?payment=success.
   * Needed when IPN cannot reach the merchant (localhost) or arrives late.
   */
  async sync(paymentId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, deletedAt: null },
      include: { order: true },
    });
    if (!payment || payment.productLane !== ESIM_LANE || payment.gateway !== PaymentGatewayCode.SEPAY) {
      throw new BadRequestException('eSIM SePay payment not found');
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

    const configResult = this.gatewayConfig();
    if (!configResult.ok) {
      throw new BadRequestException('eSIM SePay checkout is not configured');
    }
    const config = configResult.config;
    const queried = await querySepayPgOrder({
      environment: config.environment,
      merchantId: config.merchantId,
      merchantSecretKey: config.merchantSecret,
      invoiceNumber: payment.paymentReference,
    });
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
        `eSIM SePay sync amount rejected invoice=${payment.paymentReference} reason=${
          error instanceof Error ? error.message : 'AMOUNT'
        }`,
      );
      return {
        paymentReference: payment.paymentReference,
        status: PaymentRecordStatus.PENDING,
        synced: false,
      };
    }
    const providerTransactionId =
      queried.providerOrderId?.trim() ||
      (queried.raw &&
      typeof queried.raw === 'object' &&
      typeof (queried.raw as { id?: unknown }).id === 'string'
        ? String((queried.raw as { id: string }).id)
        : '');
    if (!providerTransactionId) {
      return {
        paymentReference: payment.paymentReference,
        status: PaymentRecordStatus.PENDING,
        synced: false,
      };
    }

    const settlement = await this.claimSettlement({
      paymentId: payment.id,
      orderId: payment.orderId,
      providerTransactionId,
    });
    if (settlement === 'SETTLED') {
      await this.fulfillmentDispatchService.dispatchOrderFulfillment(payment.orderId);
      await this.notificationService.notifyPaymentSuccess(payment.orderId);
      return {
        paymentReference: payment.paymentReference,
        status: PaymentRecordStatus.SUCCESS,
        synced: true,
      };
    }
    if (settlement === 'DUPLICATE') {
      return {
        paymentReference: payment.paymentReference,
        status: PaymentRecordStatus.SUCCESS,
        synced: false,
      };
    }
    // IPN may have settled first under a different provider transaction id.
    const latest = await this.prisma.payment.findFirst({
      where: { id: payment.id, deletedAt: null },
    });
    if (latest?.status === PaymentRecordStatus.SUCCESS) {
      return {
        paymentReference: payment.paymentReference,
        status: PaymentRecordStatus.SUCCESS,
        synced: false,
      };
    }
    this.logger.warn(`eSIM SePay sync ${settlement} invoice=${payment.paymentReference}`);
    return {
      paymentReference: payment.paymentReference,
      status: latest?.status ?? payment.status,
      synced: false,
      ...(settlement === 'EXPIRED' ? { manualReview: true } : {}),
    };
  }

  async handleIpn(
    payload: unknown,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<EsimSepayIpnResult> {
    const configResult = this.gatewayConfig();
    if (!configResult.ok) {
      throw new UnauthorizedException('Invalid signature');
    }
    const provided = headerValue(headers, 'x-secret-key');
    if (!secretsMatch(configResult.config.ipnSecret, provided)) {
      throw new UnauthorizedException('Invalid signature');
    }

    const invoice = readInvoice(payload);
    if (!invoice) return { success: true, outcome: 'IGNORED', reason: 'MALFORMED' };
    const payment = await this.prisma.payment.findFirst({
      where: { paymentReference: invoice, deletedAt: null },
      include: { order: true },
    });
    if (!payment || payment.productLane !== ESIM_LANE || payment.gateway !== PaymentGatewayCode.SEPAY) {
      return { success: true, outcome: 'IGNORED', reason: 'UNKNOWN_INVOICE' };
    }
    const decision = evaluateEsimSepayIpn(payload, {
      invoiceNumber: payment.paymentReference,
      amount: new Decimal(payment.amount.toString()),
    });
    if (!decision.ok || !decision.providerTransactionId) {
      await this.recordMismatch(payment.id, decision.reason);
      this.logger.warn(`eSIM SePay IPN mismatch ${decision.reason} invoice=${payment.paymentReference}`);
      return { success: true, outcome: 'IGNORED', reason: decision.reason };
    }

    const settlement = await this.claimSettlement({
      paymentId: payment.id,
      orderId: payment.orderId,
      providerTransactionId: decision.providerTransactionId,
    });
    if (settlement !== 'SETTLED') {
      if (settlement !== 'DUPLICATE') {
        this.logger.warn(`eSIM SePay IPN ${settlement} invoice=${payment.paymentReference}`);
      }
      return {
        success: true,
        outcome: settlement === 'DUPLICATE' ? 'DUPLICATE' : 'IGNORED',
        reason: settlement,
      };
    }
    await this.fulfillmentDispatchService.dispatchOrderFulfillment(payment.orderId);
    await this.notificationService.notifyPaymentSuccess(payment.orderId);
    return { success: true, outcome: 'SETTLED' };
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

  private async recordMismatch(paymentId: string, reason: string): Promise<void> {
    const current = await this.prisma.payment.findFirst({
      where: { id: paymentId, status: PaymentRecordStatus.PENDING, deletedAt: null },
      select: { gatewayResponse: true },
    });
    if (!current) return;
    const previous =
      current.gatewayResponse && typeof current.gatewayResponse === 'object' && !Array.isArray(current.gatewayResponse)
        ? current.gatewayResponse
        : {};
    await this.prisma.payment.updateMany({
      where: { id: paymentId, status: PaymentRecordStatus.PENDING, deletedAt: null },
      data: {
        gatewayResponse: {
          ...previous,
          settlementMismatch: reason,
        } as Prisma.InputJsonObject,
      },
    });
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

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

function readInvoice(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const order = (payload as { order?: { order_invoice_number?: unknown } }).order;
  return typeof order?.order_invoice_number === 'string' ? order.order_invoice_number : undefined;
}
