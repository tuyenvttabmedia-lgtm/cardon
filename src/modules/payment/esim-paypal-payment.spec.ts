import { readFileSync } from 'fs';
import { join } from 'path';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import {
  OrderPaymentStatus,
  PaymentGatewayCode,
  PaymentRecordStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PaymentService } from './services/payment.service';
import { EsimPaypalPaymentService } from './services/esim-paypal-payment.service';
import { evaluateEsimUsdPaypalSnapshot } from './providers/paypal/esim-paypal-snapshot.rules';
import { PaymentProviderRegistry } from './providers/payment-provider.registry';
import { MockMegaPayProvider, MockSePayProvider } from './providers/mock-payment.providers';

const now = new Date('2026-11-06T12:00:00.000Z');

function fxRow(overrides: Record<string, unknown> = {}) {
  const observed = new Date();
  return {
    id: 'fx-1',
    status: 'EFFECTIVE',
    rate: new Decimal('25000'),
    effectiveFrom: observed,
    effectiveTo: null,
    observedAt: observed,
    source: { maxStalenessSeconds: 3600 },
    ...overrides,
  };
}

function usdOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    orderCode: 'ORD-USD',
    userId: 'user-1',
    paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
    paymentExpiresAt: new Date(Date.now() + 600_000),
    paymentGateway: PaymentGatewayCode.PAYPAL,
    paymentMethodCode: 'PAYPAL',
    settlementType: null,
    isGuestOrder: false,
    guestEmail: null,
    catalogCurrency: 'VND',
    catalogAmount: new Decimal('112500'),
    chargeCurrency: 'USD',
    chargeAmount: new Decimal('4.50'),
    totalAmount: new Decimal('103000'),
    fxRateId: 'fx-1',
    fxRateValue: new Decimal('25000'),
    fxAsOf: now,
    esimMarket: 'INTL',
    deletedAt: null,
    ...overrides,
  };
}

function capturePayload(overrides: Record<string, unknown> = {}) {
  return {
    event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource: {
      id: 'CAP-USD',
      status: 'COMPLETED',
      custom_id: 'PAY-USD',
      amount: { currency_code: 'USD', value: '4.50' },
      supplementary_data: { related_ids: { order_id: 'PP-USD' } },
      ...overrides,
    },
  };
}

describe('eSIM USD snapshot gate', () => {
  const base = {
    chargeCurrency: 'USD',
    chargeAmount: new Decimal('4.50'),
    fxRateId: 'fx-1',
    fxRateValue: new Decimal('25000'),
    fxAsOf: now,
    fx: {
      status: 'EFFECTIVE',
      effectiveTo: null,
      observedAt: now,
      effectiveFrom: now,
      maxStalenessSeconds: 3600,
    },
    now,
  };

  it('accepts a fresh USD snapshot', () => {
    expect(evaluateEsimUsdPaypalSnapshot(base)).toEqual({ ok: true, amount: '4.50' });
  });

  it('rejects a missing snapshot, a VND charge, a zero or long amount, and a stale FX row', () => {
    expect(evaluateEsimUsdPaypalSnapshot({ ...base, fxRateId: null }).ok).toBe(false);
    expect(evaluateEsimUsdPaypalSnapshot({ ...base, chargeCurrency: 'VND' })).toMatchObject({
      reason: 'INVALID_CURRENCY',
    });
    expect(evaluateEsimUsdPaypalSnapshot({ ...base, chargeAmount: new Decimal('0.00') })).toMatchObject({
      reason: 'INVALID_AMOUNT',
    });
    expect(evaluateEsimUsdPaypalSnapshot({ ...base, chargeAmount: new Decimal('4.505') })).toMatchObject({
      reason: 'INVALID_AMOUNT',
    });
    expect(
      evaluateEsimUsdPaypalSnapshot({
        ...base,
        fx: {
          ...base.fx,
          observedAt: new Date(now.getTime() - 3601_000),
          effectiveFrom: new Date(now.getTime() - 3601_000),
        },
      }),
    ).toMatchObject({ reason: 'FX_EXPIRED' });
    expect(
      evaluateEsimUsdPaypalSnapshot({
        ...base,
        fx: {
          ...base.fx,
          observedAt: new Date(now.getTime() - 10 * 86_400_000),
          effectiveFrom: now,
        },
      }).ok,
    ).toBe(true);
    expect(
      evaluateEsimUsdPaypalSnapshot({
        ...base,
        fx: { ...base.fx, status: 'SUPERSEDED' },
      }),
    ).toMatchObject({ reason: 'FX_EXPIRED' });
  });
});

describe('EsimPaypalPaymentService', () => {
  function harness(options?: {
    order?: Record<string, unknown>;
    fx?: Record<string, unknown> | null;
    capture?: { kind: string; captureId?: string; amount?: string; currency?: string; reason?: string };
  }) {
    const order = usdOrder(options?.order);
    const fx = options?.fx === undefined ? fxRow() : options.fx;
    let paymentStatus: PaymentRecordStatus = PaymentRecordStatus.PENDING;
    let orderStatus = order.paymentStatus as OrderPaymentStatus;
    let gatewayTransactionId: string | null = null;
    let gatewayResponse: Record<string, unknown> = {};
    let stored: Record<string, unknown> | null = null;
    let chain: Promise<unknown> = Promise.resolve();
    const paypal = {
      createPayment: jest.fn(async (params: { amount: string; currency?: string }) => ({
        paymentUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=PP-USD',
        providerReference: 'PP-USD',
        rawResponse: { paypalOrderId: 'PP-USD' },
        echoed: params,
      })),
      captureOrder: jest.fn(async () => options?.capture ?? {
        kind: 'completed',
        captureId: 'CAP-USD',
        amount: '4.50',
        currency: 'USD',
      }),
      readOrder: jest.fn(async () => ({ kind: 'unknown' })),
    };
    const row = () => ({
      id: 'pay-1',
      orderId: order.id,
      gateway: PaymentGatewayCode.PAYPAL,
      productLane: 'ESIM',
      currency: 'USD',
      paymentReference: (stored?.paymentReference as string | undefined) ?? 'PAY-USD',
      idempotencyKey: stored?.idempotencyKey ?? 'key-1',
      amount: stored?.amount ?? order.chargeAmount,
      fxRateId: 'fx-1',
      status: paymentStatus,
      gatewayTransactionId,
      expiresAt: order.paymentExpiresAt,
      paidAt: null,
      createdAt: now,
      methodCode: 'PAYPAL',
      settlementType: null,
      gatewayResponse,
      order: { ...order, paymentStatus: orderStatus },
    });
    const paymentApi = {
      findFirst: jest.fn(async (args?: { where?: Record<string, unknown> }) => {
        const where = args?.where ?? {};
        if (where.gatewayTransactionId && where.id && typeof where.id === 'object') return null;
        if (!stored && !where.id) return null;
        if (where.id && where.id !== 'pay-1') return null;
        return row();
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        stored = { ...data, id: 'pay-1' };
        gatewayResponse = (data.gatewayResponse as Record<string, unknown>) ?? {};
        paymentStatus = PaymentRecordStatus.PENDING;
        return row();
      }),
      update: jest.fn(async ({ data }: { data: { gatewayResponse?: Record<string, unknown>; status?: PaymentRecordStatus } }) => {
        if (data.gatewayResponse) gatewayResponse = data.gatewayResponse;
        if (data.status) paymentStatus = data.status;
        return row();
      }),
      updateMany: jest.fn(async ({ data }: { data: { status?: PaymentRecordStatus; gatewayTransactionId?: string; gatewayResponse?: Record<string, unknown> } }) => {
        if (data.status === PaymentRecordStatus.SUCCESS) {
          if (paymentStatus !== PaymentRecordStatus.PENDING) return { count: 0 };
          paymentStatus = PaymentRecordStatus.SUCCESS;
          gatewayTransactionId = data.gatewayTransactionId ?? gatewayTransactionId;
          if (data.gatewayResponse) gatewayResponse = data.gatewayResponse;
          return { count: 1 };
        }
        if (data.status === PaymentRecordStatus.FAILED) {
          if (paymentStatus !== PaymentRecordStatus.PENDING) return { count: 0 };
          paymentStatus = PaymentRecordStatus.FAILED;
        }
        if (data.gatewayResponse) gatewayResponse = { ...gatewayResponse, ...data.gatewayResponse };
        return { count: paymentStatus === PaymentRecordStatus.SUCCESS ? 0 : 1 };
      }),
    };
    const tx = {
      $executeRaw: jest.fn(),
      payment: paymentApi,
      order: {
        findFirst: jest.fn(async () => ({ ...order, paymentStatus: orderStatus })),
        update: jest.fn(),
        updateMany: jest.fn(async ({ where, data }: { where: { paymentStatus?: string }; data: { paymentStatus?: OrderPaymentStatus } }) => {
          if (
            where.paymentStatus === OrderPaymentStatus.WAITING_PAYMENT &&
            orderStatus === OrderPaymentStatus.WAITING_PAYMENT &&
            data.paymentStatus === OrderPaymentStatus.PAID
          ) {
            orderStatus = OrderPaymentStatus.PAID;
            return { count: 1 };
          }
          return { count: 0 };
        }),
      },
      financialTransaction: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      order: {
        findFirst: jest.fn(async () => ({ ...order, paymentStatus: orderStatus })),
        update: jest.fn(),
      },
      fxRate: { findFirst: jest.fn(async () => fx) },
      payment: paymentApi,
      $transaction: (fn: (client: typeof tx) => Promise<unknown>) => {
        const run = chain.then(async () => {
          const snap = {
            paymentStatus,
            orderStatus,
            gatewayTransactionId,
            gatewayResponse: { ...gatewayResponse },
          };
          try {
            return await fn(tx);
          } catch (error) {
            paymentStatus = snap.paymentStatus;
            orderStatus = snap.orderStatus;
            gatewayTransactionId = snap.gatewayTransactionId;
            gatewayResponse = snap.gatewayResponse;
            throw error;
          }
        });
        chain = run.then(() => undefined, () => undefined);
        return run;
      },
    };
    let settlementOpen = false;
    const wrappedTransaction = prisma.$transaction;
    prisma.$transaction = ((fn: (client: typeof tx) => Promise<unknown>) => {
      settlementOpen = true;
      return wrappedTransaction(async (client) => {
        try {
          return await fn(client);
        } finally {
          settlementOpen = false;
        }
      });
    }) as typeof prisma.$transaction;
    const fulfillment = {
      dispatchOrderFulfillment: jest.fn(async () => {
        expect(settlementOpen).toBe(false);
        return ['esim-fulfill-order-1'];
      }),
    };
    const notification = { notifyPaymentSuccess: jest.fn() };
    const service = new EsimPaypalPaymentService(
      prisma as never,
      paypal as never,
      fulfillment as never,
      notification as never,
    );
    return {
      service,
      paypal,
      fulfillment,
      notification,
      prisma,
      state: () => ({ paymentStatus, orderStatus, gatewayResponse, gatewayTransactionId, stored }),
    };
  }

  it('creates one PayPal order from the USD snapshot and ignores the VND total', async () => {
    const box = harness();
    const view = await box.service.createFromSnapshot({ orderId: 'order-1', idempotencyKey: 'key-1' });
    const params = box.paypal.createPayment.mock.calls[0][0] as { amount: string; currency: string };
    expect(params).toMatchObject({ amount: '4.50', currency: 'USD' });
    expect(params.amount).not.toBe('103000.00');
    expect(view.paymentUrl).toContain('sandbox.paypal.com');
    const created = box.prisma.payment.create.mock.calls[0][0].data as {
      amount: { toString(): string };
      currency: string;
      productLane: string;
      fxRateId: string;
    };
    expect(created.amount.toString()).toBe('4.5');
    expect(created.currency).toBe('USD');
    expect(created.productLane).toBe('ESIM');
    expect(created.fxRateId).toBe('fx-1');
    expect(box.state().gatewayResponse).toMatchObject({ paypalOrderId: 'PP-USD' });

    const again = await box.service.createFromSnapshot({ orderId: 'order-1', idempotencyKey: 'key-2' });
    expect(again.paymentReference).toBe(view.paymentReference);
    expect(box.paypal.createPayment).toHaveBeenCalledTimes(1);
    expect(box.fulfillment.dispatchOrderFulfillment).not.toHaveBeenCalled();
  });

  it('rejects VND, a missing snapshot, a stale FX row, and an invalid amount before calling PayPal', async () => {
    const vnd = harness({ order: { chargeCurrency: 'VND', chargeAmount: new Decimal('103000') } });
    await expect(vnd.service.createFromSnapshot({ orderId: 'order-1', idempotencyKey: 'key-1' })).rejects.toThrow(
      /INVALID_CURRENCY/,
    );
    const missing = harness({ order: { fxRateId: null, fxRateValue: null, fxAsOf: null } });
    await expect(missing.service.createFromSnapshot({ orderId: 'order-1', idempotencyKey: 'key-1' })).rejects.toThrow(
      /MISSING_SNAPSHOT/,
    );
    const stale = harness({
      fx: fxRow({
        observedAt: new Date(Date.now() - 7200_000),
        effectiveFrom: new Date(Date.now() - 7200_000),
      }),
    });
    await expect(stale.service.createFromSnapshot({ orderId: 'order-1', idempotencyKey: 'key-1' })).rejects.toThrow(
      /FX_EXPIRED/,
    );
    const republished = harness({
      fx: fxRow({
        observedAt: new Date(Date.now() - 10 * 86_400_000),
        effectiveFrom: new Date(),
      }),
    });
    await expect(
      republished.service.createFromSnapshot({ orderId: 'order-1', idempotencyKey: 'key-republished' }),
    ).resolves.toMatchObject({ amount: '4.50', paymentUrl: expect.stringContaining('paypal.com') });
    const zero = harness({ order: { chargeAmount: new Decimal('0.00') } });
    await expect(zero.service.createFromSnapshot({ orderId: 'order-1', idempotencyKey: 'key-1' })).rejects.toThrow(
      /INVALID_AMOUNT/,
    );
    for (const box of [vnd, missing, stale, zero]) {
      expect(box.paypal.createPayment).not.toHaveBeenCalled();
      expect(box.prisma.payment.create).not.toHaveBeenCalled();
    }
  });

  it('settles one matching capture and does not fulfill a repeat or a bad capture', async () => {
    const box = harness();
    await box.service.createFromSnapshot({ orderId: 'order-1', idempotencyKey: 'key-1' });
    const first = await box.service.handleVerifiedWebhook({ paymentId: 'pay-1', payload: capturePayload() });
    expect(first.outcome).toBe('SETTLED');
    expect(box.state().paymentStatus).toBe(PaymentRecordStatus.SUCCESS);
    expect(box.state().orderStatus).toBe(OrderPaymentStatus.PAID);
    expect(box.fulfillment.dispatchOrderFulfillment).toHaveBeenCalledTimes(1);
    expect(box.paypal.captureOrder).not.toHaveBeenCalled();

    const repeat = await box.service.handleVerifiedWebhook({ paymentId: 'pay-1', payload: capturePayload() });
    expect(repeat.outcome).toBe('DUPLICATE');
    expect(box.fulfillment.dispatchOrderFulfillment).toHaveBeenCalledTimes(1);

    const wrong = harness();
    await wrong.service.createFromSnapshot({ orderId: 'order-1', idempotencyKey: 'key-1' });
    const currency = await wrong.service.handleVerifiedWebhook({
      paymentId: 'pay-1',
      payload: capturePayload({ amount: { currency_code: 'EUR', value: '4.50' } }),
    });
    const amount = await wrong.service.handleVerifiedWebhook({
      paymentId: 'pay-1',
      payload: capturePayload({ amount: { currency_code: 'USD', value: '103000.00' } }),
    });
    const orderId = await wrong.service.handleVerifiedWebhook({
      paymentId: 'pay-1',
      payload: capturePayload({
        supplementary_data: { related_ids: { order_id: 'OTHER' } },
      }),
    });
    expect(currency.reason).toBe('CURRENCY');
    expect(amount.reason).toBe('AMOUNT');
    expect(orderId.reason).toBe('ORDER_ID');
    expect(wrong.state().paymentStatus).toBe(PaymentRecordStatus.PENDING);
    expect(wrong.state().orderStatus).toBe(OrderPaymentStatus.WAITING_PAYMENT);
    expect(wrong.fulfillment.dispatchOrderFulfillment).not.toHaveBeenCalled();
  });

  it('lets only one of two concurrent captures settle and enqueue', async () => {
    const box = harness();
    await box.service.createFromSnapshot({ orderId: 'order-1', idempotencyKey: 'key-1' });
    const [left, right] = await Promise.all([
      box.service.handleVerifiedWebhook({ paymentId: 'pay-1', payload: capturePayload() }),
      box.service.handleVerifiedWebhook({ paymentId: 'pay-1', payload: capturePayload() }),
    ]);
    expect([left.outcome, right.outcome].sort()).toEqual(['DUPLICATE', 'SETTLED']);
    expect(box.fulfillment.dispatchOrderFulfillment).toHaveBeenCalledTimes(1);
    expect(box.notification.notifyPaymentSuccess).toHaveBeenCalledTimes(1);
    expect(box.state().orderStatus).toBe(OrderPaymentStatus.PAID);
  });

  it('does not capture again or fulfill when the paid transaction rolls back', async () => {
    const box = harness();
    await box.service.createFromSnapshot({ orderId: 'order-1', idempotencyKey: 'key-1' });
    const original = box.prisma.$transaction.bind(box.prisma);
    let claim = 0;
    box.prisma.$transaction = (async (fn: (client: { order: { updateMany: jest.Mock } }) => Promise<unknown>) => {
      claim += 1;
      if (claim === 1) {
        return original(async (client: { order: { updateMany: jest.Mock } }) => {
          client.order.updateMany = jest.fn(async () => ({ count: 0 }));
          return fn(client);
        });
      }
      return original(fn as never);
    }) as typeof box.prisma.$transaction;

    const failed = await box.service.sync('pay-1');
    expect(failed.synced).toBe(false);
    expect(box.paypal.captureOrder).toHaveBeenCalledTimes(1);
    expect(box.state().paymentStatus).toBe(PaymentRecordStatus.PENDING);
    expect(box.state().gatewayResponse).toMatchObject({
      reconciliationRequired: true,
      reconciliationReason: 'CAPTURED_UNSETTLED',
    });
    expect(box.fulfillment.dispatchOrderFulfillment).not.toHaveBeenCalled();

    const again = await box.service.sync('pay-1');
    expect(again.synced).toBe(false);
    expect(box.paypal.captureOrder).toHaveBeenCalledTimes(1);
    expect(box.paypal.readOrder).toHaveBeenCalled();
  });

  it('does not settle another lane', async () => {
    const box = harness();
    box.prisma.payment.findFirst.mockResolvedValueOnce({
      id: 'pay-retail',
      productLane: null,
      gateway: PaymentGatewayCode.PAYPAL,
      paymentReference: 'PAY-RETAIL',
      status: PaymentRecordStatus.PENDING,
      deletedAt: null,
    } as never);
    const result = await box.service.handleVerifiedWebhook({
      paymentId: 'pay-retail',
      payload: capturePayload(),
    });
    expect(result).toMatchObject({ outcome: 'IGNORED', reason: 'LANE' });
    expect(box.fulfillment.dispatchOrderFulfillment).not.toHaveBeenCalled();
  });
});

describe('PayPal eSIM routing leaves admin-test, SePay, and retail settlement alone', () => {
  it('keeps the eSIM PayPal service off the retail paid function and the VND total', () => {
    const source = readFileSync(join(__dirname, 'services/esim-paypal-payment.service.ts'), 'utf8');
    expect(source).not.toContain('markPaidInTransaction');
    expect(source).not.toContain('totalAmount');
    const retail = readFileSync(join(__dirname, 'services/payment.service.ts'), 'utf8');
    expect(retail).toContain('markPaidInTransaction');
    expect(retail).toContain('createAdminTestPaypalPayment');
  });

  function routed(itemType: string, gateway: PaymentGatewayCode) {
    const sepay = { createFromSnapshot: jest.fn().mockResolvedValue({ id: 'sepay' }) };
    const paypal = { createFromSnapshot: jest.fn().mockResolvedValue({ id: 'paypal' }) };
    const prisma = {
      order: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'order-1',
          userId: 'user-1',
          totalAmount: new Decimal('103000'),
          paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
          paymentGateway: gateway,
          paymentExpiresAt: new Date(Date.now() + 600_000),
          deletedAt: null,
          clientTrace: {},
        }),
      },
      orderItem: {
        findMany: jest.fn().mockResolvedValue([{ variant: { type: itemType } }]),
      },
      payment: { create: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn({
        payment: {
          create: jest.fn().mockResolvedValue({
            id: 'pay-retail',
            orderId: 'order-1',
            gateway,
            paymentReference: 'PAY-RETAIL',
            amount: new Decimal('103000'),
            status: PaymentRecordStatus.PENDING,
            expiresAt: new Date(),
            gatewayResponse: { paymentUrl: 'https://retail.example/pay' },
            paidAt: null,
            createdAt: new Date(),
          }),
        },
        order: { update: jest.fn() },
      })),
    };
    const service = new PaymentService(
      prisma as never,
      { findByIdempotencyKey: jest.fn() } as never,
      {} as never,
      PaymentProviderRegistry.withProviders(new MockMegaPayProvider(), new MockSePayProvider()),
      {} as never,
      { recordPaymentCreated: jest.fn() } as never,
      { dispatchOrderFulfillment: jest.fn() } as never,
      { notifyPaymentSuccess: jest.fn() } as never,
      { dispatch: jest.fn() } as never,
      undefined,
      sepay as never,
      paypal as never,
    );
    return { service, sepay, paypal, prisma };
  }

  it('sends eSIM PayPal to the USD service and eSIM SePay to the VND service', async () => {
    const paypalOrder = routed('ESIM', PaymentGatewayCode.PAYPAL);
    await paypalOrder.service.createPayment(
      { orderId: 'order-1', gateway: PaymentGatewayCode.PAYPAL },
      'idem-paypal',
      { id: 'user-1', email: 'u@test.com', role: 'CUSTOMER' },
    );
    expect(paypalOrder.paypal.createFromSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'order-1',
    }));
    expect(paypalOrder.sepay.createFromSnapshot).not.toHaveBeenCalled();
    expect(paypalOrder.prisma.$transaction).not.toHaveBeenCalled();

    const sepayOrder = routed('ESIM', PaymentGatewayCode.SEPAY);
    await sepayOrder.service.createPayment(
      { orderId: 'order-1', gateway: PaymentGatewayCode.SEPAY },
      'idem-sepay',
      { id: 'user-1', email: 'u@test.com', role: 'CUSTOMER' },
    );
    expect(sepayOrder.sepay.createFromSnapshot).toHaveBeenCalled();
    expect(sepayOrder.paypal.createFromSnapshot).not.toHaveBeenCalled();
  });

  it('keeps a card payment on the retail path', async () => {
    const retail = routed('PHONE_CARD', PaymentGatewayCode.MEGAPAY);
    const created = await retail.service.createPayment(
      { orderId: 'order-1', gateway: PaymentGatewayCode.MEGAPAY },
      'idem-card',
      { id: 'user-1', email: 'u@test.com', role: 'CUSTOMER' },
    );
    expect(created.paymentReference).toBe('PAY-RETAIL');
    expect(retail.paypal.createFromSnapshot).not.toHaveBeenCalled();
    expect(retail.sepay.createFromSnapshot).not.toHaveBeenCalled();
  });

  it('does not settle an eSIM PayPal webhook when the signature is invalid', async () => {
    const esim = { handleVerifiedWebhook: jest.fn() };
    const service = new PaymentService(
      {} as never,
      { findByReference: jest.fn() } as never,
      { create: jest.fn() } as never,
      {
        get: () => ({
          verifyWebhook: jest.fn().mockResolvedValue({
            valid: false,
            paymentReference: 'PAY-USD',
            status: 'PENDING',
            rawPayload: {},
          }),
        }),
      } as never,
      {} as never,
      {} as never,
      { dispatchOrderFulfillment: jest.fn() } as never,
      { notifyPaymentSuccess: jest.fn() } as never,
      { dispatch: jest.fn() } as never,
      undefined,
      undefined,
      esim as never,
    );
    await expect(
      service.handleWebhook('paypal', capturePayload(), {
        'paypal-transmission-id': 'tx',
        'paypal-transmission-sig': 'bad',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(esim.handleVerifiedWebhook).not.toHaveBeenCalled();
  });

  it('does not mark an admin-test payment paid when the capture order id does not match', async () => {
    const claimPendingStatus = jest.fn();
    const service = new PaymentService(
      { order: { findUnique: jest.fn() }, $transaction: jest.fn() } as never,
      {
        findByReference: jest.fn().mockResolvedValue({
          id: 'pay-1',
          orderId: 'order-1',
          gateway: PaymentGatewayCode.PAYPAL,
          productLane: null,
          paymentReference: 'PAY-1',
          amount: new Decimal('1.00'),
          status: PaymentRecordStatus.PENDING,
          expiresAt: new Date(Date.now() + 600_000),
          gatewayResponse: { paypalOrderId: 'PP1' },
          order: { paymentStatus: OrderPaymentStatus.WAITING_PAYMENT },
        }),
        findSuccessByProviderTransactionId: jest.fn(),
        claimPendingStatus,
      } as never,
      { create: jest.fn() } as never,
      {
        get: () => ({
          verifyWebhook: jest.fn().mockResolvedValue({
            valid: true,
            paymentReference: 'PAY-1',
            status: 'SUCCESS',
            amount: '1.00',
            providerTransactionId: 'CAP1',
            rawPayload: {},
          }),
        }),
      } as never,
      { markPaidInTransaction: jest.fn() } as never,
      { recordPaymentSuccess: jest.fn() } as never,
      { dispatchOrderFulfillment: jest.fn() } as never,
      { notifyPaymentSuccess: jest.fn() } as never,
      { dispatch: jest.fn() } as never,
    );
    const result = await service.handleWebhook('paypal', capturePayload({
      id: 'CAP1',
      custom_id: 'PAY-1',
      amount: { currency_code: 'USD', value: '1.00' },
      supplementary_data: { related_ids: { order_id: 'OTHER-ORDER' } },
    }), {});
    expect(result.ok).toBe(true);
    expect(result.duplicate).toBeUndefined();
    expect(claimPendingStatus).not.toHaveBeenCalled();
  });
});
