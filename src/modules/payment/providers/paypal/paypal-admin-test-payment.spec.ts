import { BadRequestException } from '@nestjs/common';
import { OrderPaymentStatus, PaymentGatewayCode, PaymentRecordStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PaymentService } from '../../services/payment.service';
import { PaypalClient } from './paypal.client';
import { PaypalProvider } from './paypal.provider';

const charge = {
  currency: 'USD',
  amount: '1.00',
  mode: 'sandbox',
  catalogCurrency: 'VND',
  catalogSellAmountVnd: '103000',
};

function sandboxConfig(mode: 'sandbox' | 'live' = 'sandbox', clientSecret = 'secret') {
  return {
    esimEnabled: true,
    mode,
    clientId: 'client',
    clientSecret,
    webhookId: 'wh-1',
  };
}

function paypalResult(orderId = 'PP1') {
  return {
    paymentUrl: `https://www.sandbox.paypal.com/checkoutnow?token=${orderId}`,
    providerReference: orderId,
    rawResponse: {
      paypalOrderId: orderId,
      captureState: 'CREATED',
      approvalUrl: `https://www.sandbox.paypal.com/checkoutnow?token=${orderId}`,
    },
  };
}

function harness(options?: {
  mode?: 'sandbox' | 'live';
  clientSecret?: string;
  gateway?: string;
  initial?: Record<string, unknown> | null;
}) {
  const events: string[] = [];
  const paypal = {
    gateway: PaymentGatewayCode.PAYPAL,
    createPayment: jest.fn(async (_input: { paymentReference: string }) => {
      events.push('paypal');
      return paypalResult();
    }),
  };
  let stored: Record<string, unknown> | null = options?.initial ?? null;
  let chain: Promise<unknown> = Promise.resolve();
  const orderUpdate = jest.fn();
  const order = {
    id: '11111111-1111-4111-8111-111111111111',
    userId: 'sa-1',
    clientTrace: {
      adminTest: true,
      adminTestCharge: { ...charge },
    },
    totalAmount: new Decimal(103000),
    sellAmount: new Decimal(103000),
    customerPaid: new Decimal(103000),
    paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
    paymentGateway: options?.gateway ?? 'PAYPAL',
    paymentMethodCode: options?.gateway === 'SEPAY' ? 'VIETQR' : 'PAYPAL',
    settlementType: 'GATEWAY_SETTLEMENT',
    paymentExpiresAt: new Date(Date.now() + 600_000),
    deletedAt: null,
    isGuestOrder: false,
    guestEmail: 'superadmin@cardon.vn',
  };
  const tx = {
    $executeRaw: jest.fn(async () => 1),
    payment: {
      findFirst: jest.fn(async () => stored),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        stored = {
          id: 'pay-1',
          paidAt: null,
          createdAt: new Date(),
          expiresAt: order.paymentExpiresAt,
          status: PaymentRecordStatus.PENDING,
          gatewayResponse: data.gatewayResponse,
          ...data,
        };
        return stored;
      }),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        stored = { ...(stored ?? {}), ...data };
        return stored;
      }),
    },
    order: { update: orderUpdate },
  };
  const prisma = {
    order: {
      findFirst: jest.fn(async () => order),
      update: orderUpdate,
    },
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) => {
      const run = chain.then(async () => {
        events.push('tx-start');
        try {
          return await callback(tx);
        } finally {
          events.push('tx-end');
        }
      });
      chain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    }),
  };
  const fulfillment = { dispatchOrderFulfillment: jest.fn() };
  const notify = { notifyPaymentSuccess: jest.fn() };
  const service = new PaymentService(
    prisma as never,
    { findByIdempotencyKey: jest.fn(async (key: string) => (stored?.idempotencyKey === key ? stored : null)) } as never,
    { create: jest.fn() } as never,
    { get: () => paypal } as never,
    { markPaidInTransaction: jest.fn() } as never,
    { recordPaymentCreated: jest.fn() } as never,
    fulfillment as never,
    notify as never,
    { dispatch: jest.fn() } as never,
    { resolvePaypalConfig: () => sandboxConfig(options?.mode, options?.clientSecret) } as never,
  );
  return {
    service,
    paypal,
    order,
    orderUpdate,
    tx,
    fulfillment,
    notify,
    events,
    get stored() {
      return stored;
    },
  };
}

function requestIds(paypal: { createPayment: jest.Mock }): string[] {
  return paypal.createPayment.mock.calls.map(
    (call) => (call[0] as { paymentReference: string }).paymentReference,
  );
}

function storedResponse(stored: Record<string, unknown> | null): Record<string, unknown> {
  return (stored?.gatewayResponse ?? {}) as Record<string, unknown>;
}

const user = { id: 'sa-1', email: 'superadmin@cardon.vn', role: 'SUPER_ADMIN' as const };

describe('admin-test PayPal payment amount', () => {
  it('sends 1.00 USD and stores that amount without rewriting the order', async () => {
    const ctx = harness();
    const created = await ctx.service.createPayment(
      { orderId: ctx.order.id, gateway: PaymentGatewayCode.PAYPAL },
      'idem-1',
      user,
    );
    expect(ctx.paypal.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: '1.00', currency: 'USD' }),
    );
    expect(created.amount).toBe('1.00');
    expect(ctx.order.totalAmount.toFixed(0)).toBe('103000');
    expect(ctx.order.clientTrace.adminTestCharge).toEqual(charge);
    expect(ctx.orderUpdate).toHaveBeenCalledWith({
      where: { id: ctx.order.id },
      data: { paymentId: 'pay-1' },
    });
    expect(ctx.tx.$executeRaw).toHaveBeenCalled();
    expect(created.status).toBe(PaymentRecordStatus.PENDING);
    expect(created.paymentUrl).toBe('https://www.sandbox.paypal.com/checkoutnow?token=PP1');
    expect(ctx.tx.payment.create.mock.calls[0][0].data.gatewayResponse).toEqual({});
    expect(ctx.tx.payment.create.mock.calls[0][0].data.status).toBe(PaymentRecordStatus.PENDING);
    expect(ctx.tx.payment.create.mock.invocationCallOrder[0]).toBeLessThan(
      ctx.paypal.createPayment.mock.invocationCallOrder[0],
    );
    expect(ctx.events.indexOf('paypal')).toBeGreaterThan(ctx.events.indexOf('tx-end'));
    expect(storedResponse(ctx.stored).paypalOrderId).toBe('PP1');
    expect(ctx.stored?.status).toBe(PaymentRecordStatus.PENDING);
    expect(requestIds(ctx.paypal)).toEqual([ctx.stored?.paymentReference]);
    expect(ctx.fulfillment.dispatchOrderFulfillment).not.toHaveBeenCalled();
    expect(ctx.notify.notifyPaymentSuccess).not.toHaveBeenCalled();
  });

  it('returns the existing approval URL on retry and on a second idempotency key', async () => {
    const ctx = harness();
    const first = await ctx.service.createPayment(
      { orderId: ctx.order.id, gateway: PaymentGatewayCode.PAYPAL },
      'idem-1',
      user,
    );
    const sameKey = await ctx.service.createPayment(
      { orderId: ctx.order.id, gateway: PaymentGatewayCode.PAYPAL },
      'idem-1',
      user,
    );
    const otherKey = await ctx.service.createPayment(
      { orderId: ctx.order.id, gateway: PaymentGatewayCode.PAYPAL },
      'idem-2',
      user,
    );
    expect(ctx.paypal.createPayment).toHaveBeenCalledTimes(1);
    expect(sameKey.paymentUrl).toBe(first.paymentUrl);
    expect(otherKey.paymentUrl).toBe(first.paymentUrl);
    expect(ctx.order.clientTrace.adminTestCharge.amount).toBe('1.00');
  });

  it('serializes concurrent creates onto one PayPal order', async () => {
    const ctx = harness();
    const [first, second] = await Promise.all([
      ctx.service.createPayment({ orderId: ctx.order.id, gateway: PaymentGatewayCode.PAYPAL }, 'idem-a', user),
      ctx.service.createPayment({ orderId: ctx.order.id, gateway: PaymentGatewayCode.PAYPAL }, 'idem-b', user),
    ]);
    expect(ctx.tx.payment.create).toHaveBeenCalledTimes(1);
    expect(ctx.paypal.createPayment).toHaveBeenCalledTimes(2);
    expect(new Set(requestIds(ctx.paypal)).size).toBe(1);
    expect(second.paymentReference).toBe(first.paymentReference);
    expect(first.status).toBe(PaymentRecordStatus.PENDING);
    expect(second.status).toBe(PaymentRecordStatus.PENDING);
    expect(storedResponse(ctx.stored).paypalOrderId).toBe('PP1');
    expect(ctx.fulfillment.dispatchOrderFulfillment).not.toHaveBeenCalled();
  });

  it('rejects a changed snapshot after the PayPal order exists', async () => {
    const ctx = harness();
    await ctx.service.createPayment(
      { orderId: ctx.order.id, gateway: PaymentGatewayCode.PAYPAL },
      'idem-1',
      user,
    );
    ctx.order.clientTrace.adminTestCharge = { ...charge, amount: '5.00' };
    await expect(
      ctx.service.createPayment(
        { orderId: ctx.order.id, gateway: PaymentGatewayCode.PAYPAL },
        'idem-2',
        user,
      ),
    ).rejects.toThrow('cannot change');
    expect(ctx.paypal.createPayment).toHaveBeenCalledTimes(1);
  });

  it('rejects LIVE mode and incomplete configuration before calling PayPal', async () => {
    const live = harness({ mode: 'live' });
    await expect(
      live.service.createPayment(
        { orderId: live.order.id, gateway: PaymentGatewayCode.PAYPAL },
        'idem-live',
        user,
      ),
    ).rejects.toThrow('sandbox mode');
    expect(live.paypal.createPayment).not.toHaveBeenCalled();

    const incomplete = harness({ clientSecret: '' });
    await expect(
      incomplete.service.createPayment(
        { orderId: incomplete.order.id, gateway: PaymentGatewayCode.PAYPAL },
        'idem-missing',
        user,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(incomplete.paypal.createPayment).not.toHaveBeenCalled();
  });

  it('does not turn a waiting VietQR order into PayPal', async () => {
    const ctx = harness({ gateway: 'SEPAY' });
    await expect(
      ctx.service.createPayment(
        { orderId: ctx.order.id, gateway: PaymentGatewayCode.PAYPAL },
        'idem-viet',
        user,
      ),
    ).rejects.toThrow(/international eSIM/);
    expect(ctx.paypal.createPayment).not.toHaveBeenCalled();
    expect(ctx.orderUpdate).not.toHaveBeenCalled();
    expect(ctx.order.paymentGateway).toBe('SEPAY');
  });

  it('keeps a customer PayPal order on its own total amount', async () => {
    const ctx = harness();
    const customerOrder = {
      ...ctx.order,
      userId: 'user-1',
      clientTrace: {},
      totalAmount: new Decimal('12.00'),
    };
    let createdAmount = '';
    const events: string[] = [];
    const inserted: { amount?: Decimal; gatewayResponse?: Record<string, unknown> } = {};
    const paypal = {
      gateway: PaymentGatewayCode.PAYPAL,
      createPayment: jest.fn(async (input: { amount: string }) => {
        events.push('paypal');
        createdAmount = input.amount;
        return {
          paymentUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=PP2',
          providerReference: 'PP2',
          rawResponse: { paypalOrderId: 'PP2' },
        };
      }),
    };
    const service = new PaymentService(
      {
        order: { findFirst: async () => customerOrder },
        $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
          callback({
            payment: {
              create: async ({ data }: { data: { amount: Decimal; gatewayResponse: Record<string, unknown> } }) => {
                events.push('insert');
                inserted.amount = data.amount;
                inserted.gatewayResponse = data.gatewayResponse;
                return {
                  id: 'pay-customer',
                  orderId: customerOrder.id,
                  gateway: PaymentGatewayCode.PAYPAL,
                  paymentReference: 'PAY-CUSTOMER',
                  amount: data.amount,
                  status: PaymentRecordStatus.PENDING,
                  expiresAt: customerOrder.paymentExpiresAt,
                  paidAt: null,
                  createdAt: new Date(),
                  gatewayResponse: data.gatewayResponse,
                };
              },
            },
            order: { update: jest.fn() },
          }),
      } as never,
      { findByIdempotencyKey: jest.fn() } as never,
      { create: jest.fn() } as never,
      { get: () => paypal } as never,
      {} as never,
      { recordPaymentCreated: jest.fn() } as never,
      { dispatchOrderFulfillment: jest.fn() } as never,
      { notifyPaymentSuccess: jest.fn() } as never,
      { dispatch: jest.fn() } as never,
    );
    const created = await service.createPayment(
      { orderId: ctx.order.id, gateway: PaymentGatewayCode.PAYPAL },
      'idem-customer',
      { id: 'user-1', email: 'c@test.invalid', role: 'CUSTOMER' },
    );
    expect(createdAmount).toBe('12.00');
    expect(created.amount).toBe('12.00');
    expect(created.status).toBe(PaymentRecordStatus.PENDING);
    expect(paypal.createPayment).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['paypal', 'insert']);
    expect(inserted.gatewayResponse?.paypalOrderId).toBe('PP2');
    expect(inserted.amount?.toFixed(2)).toBe('12.00');
  });
});

describe('admin-test PayPal create idempotency', () => {
  it('replays one lost PayPal response with the same PayPal-Request-Id and the same order', async () => {
    const ctx = harness();
    const seen: string[] = [];
    ctx.paypal.createPayment.mockImplementation(async (input: { paymentReference: string }) => {
      seen.push(input.paymentReference);
      if (seen.length === 1) throw new BadRequestException('PayPal API error');
      return paypalResult('PP1');
    });

    await expect(
      ctx.service.createPayment({ orderId: ctx.order.id, gateway: PaymentGatewayCode.PAYPAL }, 'idem-lost', user),
    ).rejects.toThrow('PayPal API error');
    expect(ctx.tx.payment.create).toHaveBeenCalledTimes(1);
    expect(storedResponse(ctx.stored)).toEqual({});
    expect(ctx.stored?.status).toBe(PaymentRecordStatus.PENDING);

    const recovered = await ctx.service.createPayment(
      { orderId: ctx.order.id, gateway: PaymentGatewayCode.PAYPAL },
      'idem-lost',
      user,
    );
    expect(ctx.paypal.createPayment).toHaveBeenCalledTimes(2);
    expect(seen).toEqual([ctx.stored?.paymentReference, ctx.stored?.paymentReference]);
    expect(new Set(seen).size).toBe(1);
    expect(recovered.paymentUrl).toBe('https://www.sandbox.paypal.com/checkoutnow?token=PP1');
    expect(recovered.status).toBe(PaymentRecordStatus.PENDING);
    expect(storedResponse(ctx.stored).paypalOrderId).toBe('PP1');
    expect(ctx.tx.payment.create).toHaveBeenCalledTimes(1);

    const again = await ctx.service.createPayment(
      { orderId: ctx.order.id, gateway: PaymentGatewayCode.PAYPAL },
      'idem-lost',
      user,
    );
    expect(ctx.paypal.createPayment).toHaveBeenCalledTimes(2);
    expect(again.paymentReference).toBe(recovered.paymentReference);
    expect(again.paymentUrl).toBe(recovered.paymentUrl);
    expect(ctx.fulfillment.dispatchOrderFulfillment).not.toHaveBeenCalled();
  });

  it('retries the same PayPal-Request-Id when the process stops after commit and before PayPal', async () => {
    const ctx = harness();
    ctx.paypal.createPayment.mockImplementationOnce(async () => {
      throw new Error('stopped before PayPal');
    });
    await expect(
      ctx.service.createPayment({ orderId: ctx.order.id, gateway: PaymentGatewayCode.PAYPAL }, 'idem-before', user),
    ).rejects.toThrow('stopped before PayPal');
    const reference = ctx.stored?.paymentReference;
    expect(ctx.tx.payment.create).toHaveBeenCalledTimes(1);
    expect(storedResponse(ctx.stored).paypalOrderId).toBeUndefined();

    const recovered = await ctx.service.createPayment(
      { orderId: ctx.order.id, gateway: PaymentGatewayCode.PAYPAL },
      'idem-before',
      user,
    );
    expect(requestIds(ctx.paypal)).toEqual([reference, reference]);
    expect(recovered.paymentReference).toBe(reference);
    expect(storedResponse(ctx.stored).paypalOrderId).toBe('PP1');
    expect(ctx.tx.payment.create).toHaveBeenCalledTimes(1);
    expect(ctx.stored?.status).toBe(PaymentRecordStatus.PENDING);
  });

  it('retries the same PayPal-Request-Id when the process stops after the response and before saving it', async () => {
    const ctx = harness();
    ctx.tx.payment.update.mockRejectedValueOnce(new Error('stopped before save'));
    await expect(
      ctx.service.createPayment({ orderId: ctx.order.id, gateway: PaymentGatewayCode.PAYPAL }, 'idem-after', user),
    ).rejects.toThrow('stopped before save');
    expect(ctx.paypal.createPayment).toHaveBeenCalledTimes(1);
    expect(storedResponse(ctx.stored).paypalOrderId).toBeUndefined();

    const recovered = await ctx.service.createPayment(
      { orderId: ctx.order.id, gateway: PaymentGatewayCode.PAYPAL },
      'idem-after',
      user,
    );
    const reference = ctx.stored?.paymentReference;
    expect(ctx.paypal.createPayment).toHaveBeenCalledTimes(2);
    expect(requestIds(ctx.paypal)).toEqual([reference, reference]);
    expect(recovered.paymentReference).toBe(reference);
    expect(storedResponse(ctx.stored).paypalOrderId).toBe('PP1');
    expect(ctx.tx.payment.create).toHaveBeenCalledTimes(1);
    expect(ctx.stored?.status).toBe(PaymentRecordStatus.PENDING);
    expect(ctx.fulfillment.dispatchOrderFulfillment).not.toHaveBeenCalled();
  });

  it('does not call PayPal again after paypalOrderId and the approval URL are stored', async () => {
    const ctx = harness();
    const first = await ctx.service.createPayment(
      { orderId: ctx.order.id, gateway: PaymentGatewayCode.PAYPAL },
      'idem-saved',
      user,
    );
    const same = await ctx.service.createPayment(
      { orderId: ctx.order.id, gateway: PaymentGatewayCode.PAYPAL },
      'idem-saved',
      user,
    );
    const other = await ctx.service.createPayment(
      { orderId: ctx.order.id, gateway: PaymentGatewayCode.PAYPAL },
      'idem-other',
      user,
    );
    expect(ctx.paypal.createPayment).toHaveBeenCalledTimes(1);
    expect(same.paymentUrl).toBe(first.paymentUrl);
    expect(other.paymentUrl).toBe(first.paymentUrl);
    expect(storedResponse(ctx.stored).paypalOrderId).toBe('PP1');
  });

  it('marks manual reconciliation after the 6 hour window and does not create another order', async () => {
    const createdAt = new Date(Date.now() - 7 * 60 * 60 * 1000);
    const ctx = harness({
      initial: {
        id: 'pay-old',
        orderId: '11111111-1111-4111-8111-111111111111',
        gateway: PaymentGatewayCode.PAYPAL,
        methodCode: 'PAYPAL',
        settlementType: 'GATEWAY_SETTLEMENT',
        paymentReference: 'PAY-OLD',
        idempotencyKey: 'idem-old',
        amount: new Decimal('1.00'),
        status: PaymentRecordStatus.PENDING,
        gatewayResponse: {},
        createdAt,
        expiresAt: new Date(createdAt.getTime() + 600_000),
        paidAt: null,
      },
    });

    await expect(
      ctx.service.createPayment({ orderId: ctx.order.id, gateway: PaymentGatewayCode.PAYPAL }, 'idem-old', user),
    ).rejects.toThrow('needs manual reconciliation');
    expect(ctx.paypal.createPayment).not.toHaveBeenCalled();
    expect(ctx.tx.payment.create).not.toHaveBeenCalled();
    expect(storedResponse(ctx.stored).adminTestCreate).toBe('NEED_MANUAL_REVIEW');
    expect(storedResponse(ctx.stored).reason).toBe('PAYPAL_IDEMPOTENCY_WINDOW_EXPIRED');
    expect(ctx.stored?.status).toBe(PaymentRecordStatus.PENDING);
    expect(ctx.stored?.paymentReference).toBe('PAY-OLD');

    await expect(
      ctx.service.createPayment({ orderId: ctx.order.id, gateway: PaymentGatewayCode.PAYPAL }, 'idem-old', user),
    ).rejects.toThrow('needs manual reconciliation');
    expect(ctx.paypal.createPayment).not.toHaveBeenCalled();
    expect(ctx.fulfillment.dispatchOrderFulfillment).not.toHaveBeenCalled();
  });

  it('does not create a replacement order when the PayPal id is known but the approval URL is still missing after 6 hours', async () => {
    const createdAt = new Date(Date.now() - 7 * 60 * 60 * 1000);
    const ctx = harness({
      initial: {
        id: 'pay-known',
        orderId: '11111111-1111-4111-8111-111111111111',
        gateway: PaymentGatewayCode.PAYPAL,
        paymentReference: 'PAY-KNOWN',
        idempotencyKey: 'idem-known',
        amount: new Decimal('1.00'),
        status: PaymentRecordStatus.PENDING,
        gatewayResponse: { paypalOrderId: 'PP-KNOWN' },
        createdAt,
        expiresAt: new Date(createdAt.getTime() + 600_000),
        paidAt: null,
      },
    });
    await expect(
      ctx.service.createPayment({ orderId: ctx.order.id, gateway: PaymentGatewayCode.PAYPAL }, 'idem-known', user),
    ).rejects.toThrow('needs manual reconciliation');
    expect(ctx.paypal.createPayment).not.toHaveBeenCalled();
    expect(storedResponse(ctx.stored).paypalOrderId).toBe('PP-KNOWN');
    expect(ctx.stored?.status).toBe(PaymentRecordStatus.PENDING);
  });

  it('sends the stored payment reference as PayPal-Request-Id and keeps the create body stable', async () => {
    const bodies: string[] = [];
    const requestIds: string[] = [];
    const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/v1/oauth2/token')) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'token' }) };
      }
      const headers = init?.headers as Record<string, string>;
      requestIds.push(headers['paypal-request-id']);
      bodies.push(String(init?.body));
      return {
        ok: true,
        status: 201,
        text: async () =>
          JSON.stringify({
            id: 'PP-STABLE',
            status: 'CREATED',
            links: [{ rel: 'approve', href: 'https://www.sandbox.paypal.com/checkoutnow?token=PP-STABLE' }],
          }),
      };
    });
    const client = new PaypalClient(fetchImpl);
    const config = sandboxConfig();
    const input = {
      paymentReference: 'PAY-STABLE',
      amount: '1.00',
      returnUrl: 'https://cardon.vn/return',
      cancelUrl: 'https://cardon.vn/cancel',
    };
    const first = await client.createOrder(config, input);
    const second = await client.createOrder(config, input);
    expect(first.orderId).toBe('PP-STABLE');
    expect(second.orderId).toBe('PP-STABLE');
    expect(requestIds).toEqual(['PAY-STABLE', 'PAY-STABLE']);
    expect(bodies[0]).toBe(bodies[1]);
    expect(JSON.parse(bodies[0])).toEqual(
      expect.objectContaining({
        intent: 'CAPTURE',
        purchase_units: [
          expect.objectContaining({
            reference_id: 'PAY-STABLE',
            custom_id: 'PAY-STABLE',
            amount: { currency_code: 'USD', value: '1.00' },
          }),
        ],
      }),
    );
    expect(fetchImpl.mock.calls.every((call) => String(call[0]).startsWith('https://api-m.sandbox.paypal.com'))).toBe(true);
    expect(fetchImpl.mock.calls.some((call) => String(call[0]).startsWith('https://api-m.paypal.com'))).toBe(false);
  });

  it('keeps the first PayPal order id when two responses disagree', async () => {
    const ctx = harness();
    let n = 0;
    ctx.paypal.createPayment.mockImplementation(async (input: { paymentReference: string }) => {
      n += 1;
      return paypalResult(n === 1 ? 'PP-A' : 'PP-B');
    });
    const [first, second] = await Promise.all([
      ctx.service.createPayment({ orderId: ctx.order.id, gateway: PaymentGatewayCode.PAYPAL }, 'idem-a', user),
      ctx.service.createPayment({ orderId: ctx.order.id, gateway: PaymentGatewayCode.PAYPAL }, 'idem-b', user),
    ]);
    expect(ctx.tx.payment.create).toHaveBeenCalledTimes(1);
    expect(new Set(requestIds(ctx.paypal)).size).toBe(1);
    expect(storedResponse(ctx.stored).paypalOrderId).toBe('PP-A');
    expect(storedResponse(ctx.stored).paypalOrderId).not.toBe('PP-B');
    expect(first.paymentReference).toBe(second.paymentReference);
    expect(ctx.stored?.status).toBe(PaymentRecordStatus.PENDING);
  });

  it('does not call PayPal when two requests arrive after the 6 hour window', async () => {
    const createdAt = new Date(Date.now() - 7 * 60 * 60 * 1000);
    const ctx = harness({
      initial: {
        id: 'pay-old',
        orderId: '11111111-1111-4111-8111-111111111111',
        gateway: PaymentGatewayCode.PAYPAL,
        paymentReference: 'PAY-OLD',
        idempotencyKey: 'idem-old',
        amount: new Decimal('1.00'),
        status: PaymentRecordStatus.PENDING,
        gatewayResponse: {},
        createdAt,
        expiresAt: new Date(createdAt.getTime() + 600_000),
        paidAt: null,
      },
    });
    await expect(
      Promise.all([
        ctx.service.createPayment({ orderId: ctx.order.id, gateway: PaymentGatewayCode.PAYPAL }, 'idem-old', user),
        ctx.service.createPayment({ orderId: ctx.order.id, gateway: PaymentGatewayCode.PAYPAL }, 'idem-other', user),
      ]),
    ).rejects.toThrow('needs manual reconciliation');
    expect(ctx.paypal.createPayment).not.toHaveBeenCalled();
    expect(ctx.tx.payment.create).not.toHaveBeenCalled();
    expect(ctx.stored?.paymentReference).toBe('PAY-OLD');
    expect(storedResponse(ctx.stored).adminTestCreate).toBe('NEED_MANUAL_REVIEW');
    expect(ctx.stored?.status).toBe(PaymentRecordStatus.PENDING);
  });
});

describe('admin-test PayPal 6 hour boundary and return URLs', () => {
  const orderId = '11111111-1111-4111-8111-111111111111';
  const now = new Date('2026-11-05T12:00:00.000Z');
  const sixHours = 6 * 60 * 60 * 1000;

  function aged(createdAt: Date) {
    return harness({
      initial: {
        id: 'pay-boundary',
        orderId,
        gateway: PaymentGatewayCode.PAYPAL,
        paymentReference: 'PAY-BOUNDARY',
        idempotencyKey: 'idem-boundary',
        amount: new Decimal('1.00'),
        status: PaymentRecordStatus.PENDING,
        gatewayResponse: {},
        createdAt,
        expiresAt: new Date(now.getTime() + 600_000),
        paidAt: null,
      },
    });
  }

  afterEach(() => {
    jest.useRealTimers();
  });

  it('calls PayPal at 5 hours 59 minutes 59 seconds and at exactly 6 hours, then stops 1 ms later', async () => {
    jest.useFakeTimers({ now });
    const inside = aged(new Date(now.getTime() - sixHours + 1000));
    await inside.service.createPayment(
      { orderId, gateway: PaymentGatewayCode.PAYPAL },
      'idem-boundary',
      user,
    );
    expect(inside.paypal.createPayment).toHaveBeenCalledTimes(1);
    expect(requestIds(inside.paypal)).toEqual(['PAY-BOUNDARY']);

    const exact = aged(new Date(now.getTime() - sixHours));
    await exact.service.createPayment(
      { orderId, gateway: PaymentGatewayCode.PAYPAL },
      'idem-boundary',
      user,
    );
    expect(exact.paypal.createPayment).toHaveBeenCalledTimes(1);
    expect(requestIds(exact.paypal)).toEqual(['PAY-BOUNDARY']);

    const after = aged(new Date(now.getTime() - sixHours - 1));
    await expect(
      after.service.createPayment(
        { orderId, gateway: PaymentGatewayCode.PAYPAL },
        'idem-boundary',
        user,
      ),
    ).rejects.toThrow('needs manual reconciliation');
    expect(after.paypal.createPayment).not.toHaveBeenCalled();
    expect(after.stored?.status).toBe(PaymentRecordStatus.PENDING);
    expect(storedResponse(after.stored).adminTestCreate).toBe('NEED_MANUAL_REVIEW');
  });

  it('builds the same return and cancel URLs on every retry and ignores the clock', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const client = {
      createOrder: jest.fn(async (_config: unknown, input: Record<string, unknown>) => {
        seen.push(input);
        return {
          orderId: 'PP1',
          approveUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=PP1',
          customId: 'PAY-1',
          observation: { kind: 'open' },
        };
      }),
    };
    const paypal = new PaypalProvider({
      resolvePaypalConfig: () => sandboxConfig(),
      resolveSystemConfig: () => ({ publicUrl: 'https://cardon.vn/' }),
    } as never);
    paypal.useClient(client as never);
    const params = {
      paymentReference: 'PAY-1',
      amount: '1.00',
      orderId,
      gateway: PaymentGatewayCode.PAYPAL,
      currency: 'USD' as const,
      expiresAt: new Date('2026-11-05T12:00:00.000Z'),
    };
    await paypal.createPayment(params);
    await paypal.createPayment({ ...params, expiresAt: new Date('2026-11-05T18:00:00.000Z') });
    expect(seen).toHaveLength(2);
    expect(seen[0]).toEqual(seen[1]);
    expect(seen[0]).toEqual({
      paymentReference: 'PAY-1',
      amount: '1.00',
      returnUrl: `https://cardon.vn/checkout/paypal/return?orderId=${orderId}`,
      cancelUrl: `https://cardon.vn/checkout/paypal/cancel?orderId=${orderId}`,
    });
  });
});
