import { readFileSync } from 'fs';
import { join } from 'path';
import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { OrderPaymentStatus, PaymentGatewayCode, PaymentRecordStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { evaluateEsimMarketPayment } from '../../../esim/esim-market.rules';
import { retailMarketAllowsHomeService, resolveRetailMarket } from '../../../product/entities/retail-market';
import { MockSePayProvider } from '../mock-payment.providers';
import { PaymentProviderRegistry } from '../payment-provider.registry';
import { PaymentService } from '../../services/payment.service';
import { PaypalClient, type PaypalFetch } from './paypal.client';
import { PaypalProvider } from './paypal.provider';
import {
  evaluatePaypalCheckoutReady,
  evaluatePaypalLiveGuard,
  paypalApiBaseUrl,
  planPaypalSettlement,
  type PaypalObservation,
  type PaypalRuntimeConfig,
  type PaypalSnapshot,
} from './paypal.rules';

const airalo = { createOrder: jest.fn() };

const sandboxConfig = (): PaypalRuntimeConfig => ({
  esimEnabled: true,
  mode: 'sandbox',
  clientId: 'client-id',
  clientSecret: 'client-secret',
  webhookId: 'wh-1',
});

function snapshot(partial: Partial<PaypalSnapshot> = {}): PaypalSnapshot {
  return {
    paymentStatus: 'PENDING',
    amount: '12.00',
    captureState: 'CREATED',
    paypalOrderId: 'PP1',
    captureId: null,
    fulfillmentQueued: false,
    ...partial,
  };
}

describe('PayPal rules', () => {
  it('keeps LIVE and sandbox on their own hosts', () => {
    expect(paypalApiBaseUrl('sandbox')).toBe('https://api-m.sandbox.paypal.com');
    expect(paypalApiBaseUrl('live')).toBe('https://api-m.paypal.com');
    expect(paypalApiBaseUrl('live')).not.toContain('sandbox');
  });

  it('blocks LIVE when credentials or webhook id are missing and does not rewrite the mode', () => {
    const guard = evaluatePaypalLiveGuard({
      mode: 'live',
      clientId: 'id',
      clientSecret: '',
      webhookId: '',
    });
    expect(guard).toEqual({ ok: false, reason: 'LIVE_REQUIRES_CREDENTIALS' });
    expect(evaluatePaypalCheckoutReady({ ...sandboxConfig(), esimEnabled: false }).ok).toBe(false);
    expect(evaluatePaypalCheckoutReady({ ...sandboxConfig(), clientSecret: '' })).toEqual({
      ok: false,
      reason: 'MISSING_CREDENTIALS',
    });
    expect(
      evaluatePaypalCheckoutReady({ ...sandboxConfig(), mode: 'live', webhookId: '' }),
    ).toEqual({ ok: false, reason: 'LIVE_REQUIRES_WEBHOOK' });
  });

  it('does not fulfill or capture again when the previous capture is unknown', () => {
    const first = planPaypalSettlement({
      snapshot: snapshot({ captureState: 'CAPTURING' }),
      observation: { kind: 'unknown' },
    });
    expect(first.paymentStatus).toBe('PENDING');
    expect(first.captureState).toBe('UNKNOWN');
    expect(first.fulfillment).toBe(false);
    expect(first.airaloCreate).toBe(false);
    expect(first.newPaypalOrder).toBe(false);

    const second = planPaypalSettlement({
      snapshot: snapshot({ captureState: 'UNKNOWN' }),
    });
    expect(second.step).toBe('query');
    expect(second.captureApi).toBe(false);
    expect(second.fulfillment).toBe(false);
  });

  it('confirms capture only when PayPal reports a completed USD amount', () => {
    const ok = planPaypalSettlement({
      snapshot: snapshot({ captureState: 'CAPTURING' }),
      observation: { kind: 'completed', captureId: 'CAP1', amount: '12.00', currency: 'USD' },
    });
    expect(ok.paymentStatus).toBe('SUCCESS');
    expect(ok.fulfillment).toBe(true);
    expect(ok.airaloCreate).toBe(false);

    const mismatch = planPaypalSettlement({
      snapshot: snapshot({ captureState: 'CAPTURING' }),
      observation: { kind: 'completed', captureId: 'CAP1', amount: '1.00', currency: 'USD' },
    });
    expect(mismatch.paymentStatus).toBe('PENDING');
    expect(mismatch.fulfillment).toBe(false);
  });

  it('marks approval cancellation as failed without a new PayPal order', () => {
    const plan = planPaypalSettlement({
      snapshot: snapshot(),
      observation: { kind: 'voided' },
    });
    expect(plan.paymentStatus).toBe('FAILED');
    expect(plan.captureState).toBe('CANCELLED');
    expect(plan.fulfillment).toBe(false);
    expect(plan.newPaypalOrder).toBe(false);
    expect(plan.airaloCreate).toBe(false);
  });

  it('treats an already successful payment as a duplicate capture', () => {
    const plan = planPaypalSettlement({
      snapshot: snapshot({
        paymentStatus: 'SUCCESS',
        captureState: 'CAPTURED',
        captureId: 'CAP1',
        fulfillmentQueued: true,
      }),
    });
    expect(plan.duplicate).toBe(true);
    expect(plan.captureApi).toBe(false);
    expect(plan.fulfillment).toBe(false);
    expect(plan.step).toBe('none');
  });

  it('can enqueue fulfillment once when payment is already successful and the queue flag is unset', () => {
    const plan = planPaypalSettlement({
      snapshot: snapshot({ paymentStatus: 'SUCCESS', captureState: 'CAPTURED', fulfillmentQueued: false }),
    });
    expect(plan.fulfillment).toBe(true);
    expect(plan.captureApi).toBe(false);
    expect(plan.airaloCreate).toBe(false);
  });
});

describe('PayPal HTTP client', () => {

  function provider(config: PaypalRuntimeConfig, fetchImpl: PaypalFetch) {
    const settings = {
      resolvePaypalConfig: () => config,
      resolveSystemConfig: () => ({ publicUrl: 'http://localhost:3001' }),
    };
    const paypal = new PaypalProvider(settings as never);
    paypal.useClient(new PaypalClient(fetchImpl));
    return paypal;
  }

  beforeEach(() => {
    httpCalls.length = 0;
    airalo.createOrder.mockClear();
  });

  it('creates a sandbox order and returns the approval URL without the secret', async () => {
    const paypal = provider(sandboxConfig(), fetchMock(200));
    const result = await paypal.createPayment({
      paymentReference: 'PAY-1',
      amount: '12.00',
      orderId: 'order-1',
      gateway: PaymentGatewayCode.PAYPAL,
      currency: 'USD',
    });
    expect(result.paymentUrl).toContain('https://www.sandbox.paypal.com/checkoutnow?token=PP1');
    expect(result.providerReference).toBe('PP1');
    expect(JSON.stringify(result.rawResponse)).not.toContain('client-secret');
    expect(JSON.stringify(result.rawResponse)).not.toContain('access_token');
    expect(httpCalls.every((url) => url.startsWith('https://api-m.sandbox.paypal.com'))).toBe(true);
    expect(airalo.createOrder).not.toHaveBeenCalled();
  });

  it('refuses checkout when the flag or credentials are missing', async () => {
    const fetchImpl = jest.fn();
    await expect(
      provider({ ...sandboxConfig(), esimEnabled: false }, fetchImpl).createPayment(createParams()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      provider({ ...sandboxConfig(), clientSecret: '' }, fetchImpl).createPayment(createParams()),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not call sandbox when LIVE is missing a webhook id', async () => {
    const fetchImpl = jest.fn();
    await expect(
      provider({ ...sandboxConfig(), mode: 'live', webhookId: '' }, fetchImpl).createPayment(createParams()),
    ).rejects.toThrow(/LIVE_REQUIRES_WEBHOOK/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('uses the live host only when LIVE is fully configured', async () => {
    const paypal = provider({ ...sandboxConfig(), mode: 'live' }, fetchMock(200));
    await paypal.createPayment(createParams());
    expect(httpCalls.some((url) => url.startsWith('https://api-m.paypal.com'))).toBe(true);
    expect(httpCalls.some((url) => url.includes('sandbox'))).toBe(false);
  });

  it('surfaces a PayPal API failure without creating another order', async () => {
    const paypal = provider(sandboxConfig(), async (url) => {
      httpCalls.push(String(url));
      if (String(url).endsWith('/v1/oauth2/token')) return jsonResponse(200, { access_token: 'tok' });
      return jsonResponse(500, { name: 'INTERNAL' });
    });
    await expect(paypal.createPayment(createParams())).rejects.toThrow(/PayPal API error/);
    expect(httpCalls.filter((url) => url.endsWith('/v2/checkout/orders'))).toHaveLength(1);
  });

  it('turns a capture timeout into an unknown result and does not create an order', async () => {
    const paypal = provider(sandboxConfig(), async () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    });
    await expect(paypal.captureOrder('PP1', 'PAY-1')).resolves.toEqual({ kind: 'unknown' });
  });

  it('marks an unapproved capture as declined', async () => {
    const paypal = provider(sandboxConfig(), async (url) => {
      if (String(url).endsWith('/v1/oauth2/token')) return jsonResponse(200, { access_token: 'tok' });
      return jsonResponse(422, { details: [{ issue: 'ORDER_NOT_APPROVED' }] });
    });
    await expect(paypal.captureOrder('PP1', 'PAY-1')).resolves.toEqual({
      kind: 'declined',
      reason: 'ORDER_NOT_APPROVED',
    });
  });

  it('rejects a webhook with a bad signature and accepts a verified capture', async () => {
    const headers = paypalHeaders();
    const invalid = provider(
      sandboxConfig(),
      async (url) => {
        if (String(url).endsWith('/v1/oauth2/token')) return jsonResponse(200, { access_token: 'tok' });
        return jsonResponse(200, { verification_status: 'FAILURE' });
      },
    );
    const denied = await invalid.verifyWebhook(captureEvent(), headers);
    expect(denied.valid).toBe(false);

    const valid = provider(
      sandboxConfig(),
      async (url) => {
        if (String(url).endsWith('/v1/oauth2/token')) return jsonResponse(200, { access_token: 'tok' });
        return jsonResponse(200, { verification_status: 'SUCCESS' });
      },
    );
    const accepted = await valid.verifyWebhook(captureEvent(), headers);
    expect(accepted.valid).toBe(true);
    expect(accepted.status).toBe('SUCCESS');
    expect(accepted.amount).toBe('12.00');
    expect(accepted.providerTransactionId).toBe('CAP1');
  });
});

describe('PayPal payment service', () => {
  const user = { id: 'user-1', email: 'u@test.com', role: 'CUSTOMER' as const };

  function setup(
    observation: PaypalObservation = completed(),
    clientTrace: Record<string, unknown> = {},
    money: { payment?: string; order?: string } = {},
  ) {
    const paymentAmount = money.payment ?? '12.00';
    const orderAmount = money.order ?? '12.00';
    let status: PaymentRecordStatus = PaymentRecordStatus.PENDING;
    let stored: Record<string, unknown> = {
      paypalOrderId: 'PP1',
      captureState: 'CREATED',
      fulfillmentQueued: false,
      paymentUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=PP1',
    };
    const captureOrder = jest.fn(async () => observation);
    const readOrder = jest.fn(async () => ({ kind: 'unknown' as const }));
    const dispatch = jest.fn(async () => ['esim-fulfill-order-1']);
    const paypal = {
      gateway: PaymentGatewayCode.PAYPAL,
      createPayment: jest.fn(async () => ({
        paymentUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=PP1',
        providerReference: 'PP1',
        rawResponse: {
          paypalOrderId: 'PP1',
          captureState: 'CREATED',
          fulfillmentQueued: false,
          approvalUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=PP1',
        },
      })),
      verifyWebhook: jest.fn(),
      queryTransaction: jest.fn(async () => ({
        paymentReference: 'PAY-1',
        status: 'PENDING' as const,
        amount: '0',
      })),
      refund: jest.fn(),
      captureOrder,
      readOrder,
    };
    const current = () => ({
      id: 'pay-1',
      orderId: 'order-1',
      gateway: PaymentGatewayCode.PAYPAL,
      paymentReference: 'PAY-1',
      amount: new Decimal(paymentAmount),
      status,
      expiresAt: new Date(Date.now() + 600_000),
      gatewayResponse: stored,
      order: {
        id: 'order-1',
        userId: 'user-1',
        paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
        paymentGateway: 'PAYPAL',
        totalAmount: new Decimal(orderAmount),
      },
    });
    const paymentRepository = {
      findByIdempotencyKey: jest.fn(),
      findByReference: jest.fn(async () => current()),
      findById: jest.fn(async () => current()),
      findLatestByOrderId: jest.fn(async () => current()),
      findSuccessByProviderTransactionId: jest.fn(),
      recordLateWebhookManualReview: jest.fn(),
      updateGatewayResponse: jest.fn(async (_id: string, next: Record<string, unknown>) => {
        stored = next;
      }),
      claimPendingStatus: jest.fn(async (_id: string, next: PaymentRecordStatus, extra?: { gatewayResponse?: unknown }) => {
        if (status !== PaymentRecordStatus.PENDING) return { count: 0 };
        status = next;
        if (extra?.gatewayResponse && typeof extra.gatewayResponse === 'object') {
          stored = extra.gatewayResponse as Record<string, unknown>;
        }
        return { count: 1 };
      }),
    };
    const service = new PaymentService(
      {
        order: {
          findFirst: jest.fn(async () => ({
            id: 'order-1',
            userId: 'user-1',
            totalAmount: new Decimal(orderAmount),
            paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
            paymentGateway: 'PAYPAL',
            paymentExpiresAt: new Date(Date.now() + 600_000),
            deletedAt: null,
            isGuestOrder: false,
            guestEmail: null,
            paymentMethodCode: 'PAYPAL',
          })),
          update: jest.fn(),
          findUnique: jest.fn(async () => ({ clientTrace, fulfillmentStatus: 'PENDING' })),
        },
        payment: { create: jest.fn(), findUnique: jest.fn(async () => ({ status })) },
        orderEvent: { create: jest.fn() },
        $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
          cb({
            payment: {
              create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
                id: 'pay-1',
                ...data,
                amount: new Decimal(paymentAmount),
                status: PaymentRecordStatus.PENDING,
                expiresAt: new Date(),
                paidAt: null,
                createdAt: new Date(),
              })),
              findUnique: jest.fn(async () => ({ status })),
            },
            order: { update: jest.fn() },
          }),
        ),
      } as never,
      paymentRepository as never,
      { create: jest.fn() } as never,
      PaymentProviderRegistry.withProviders(new MockSePayProvider(), paypal as never),
      { markPaidInTransaction: jest.fn(), markPaymentFailedInTransaction: jest.fn() } as never,
      {
        recordPaymentCreated: jest.fn(),
        recordPaymentSuccess: jest.fn(),
        recordPaymentFailed: jest.fn(),
        recordDuplicateWebhook: jest.fn(),
      } as never,
      { dispatchOrderFulfillment: dispatch } as never,
      { notifyPaymentSuccess: jest.fn(), notifyManualPaymentReview: jest.fn() } as never,
      { dispatch: jest.fn() } as never,
    );
    return { service, paypal, captureOrder, readOrder, dispatch, paymentRepository, current, setStatus: (next: PaymentRecordStatus) => { status = next; }, setStored: (next: Record<string, unknown>) => { stored = next; } };
  }

  it('stores the PayPal order and does not fulfill before capture', async () => {
    const { service, dispatch } = setup();
    const created = await service.createPayment(
      { orderId: 'order-1', gateway: PaymentGatewayCode.PAYPAL },
      'idem-1',
      user,
    );
    expect(created.paymentUrl).toContain('sandbox.paypal.com');
    expect(dispatch).not.toHaveBeenCalled();
    expect(airalo.createOrder).not.toHaveBeenCalled();
  });

  it('rejects PayPal for a non-PayPal order and leaves SePay available', async () => {
    const { service, paypal } = setup();
    (service as unknown as { prisma: { order: { findFirst: jest.Mock } } }).prisma.order.findFirst.mockResolvedValue({
      id: 'order-1',
      userId: 'user-1',
      totalAmount: new Decimal('100000'),
      paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
      paymentGateway: 'SEPAY',
      paymentExpiresAt: new Date(Date.now() + 600_000),
      deletedAt: null,
    });
    await expect(
      service.createPayment({ orderId: 'order-1', gateway: PaymentGatewayCode.PAYPAL }, 'idem-sepay', user),
    ).rejects.toThrow(/international eSIM/);
    expect(paypal.createPayment).not.toHaveBeenCalled();
    expect(airalo.createOrder).not.toHaveBeenCalled();
  });

  it('captures once on return and does not capture again', async () => {
    const { service, captureOrder, dispatch } = setup();
    const first = await service.syncFromGateway('order-1', user);
    expect(first.status).toBe(PaymentRecordStatus.SUCCESS);
    expect(captureOrder).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const second = await service.syncFromGateway('order-1', user);
    expect(second.status).toBe(PaymentRecordStatus.SUCCESS);
    expect(captureOrder).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(airalo.createOrder).not.toHaveBeenCalled();
  });

  it('does not fulfill when capture is declined or still unknown', async () => {
    const declined = setup({ kind: 'declined', reason: 'INSTRUMENT_DECLINED' });
    const failed = await declined.service.syncFromGateway('order-1', user);
    expect(failed.status).toBe(PaymentRecordStatus.FAILED);
    expect(declined.dispatch).not.toHaveBeenCalled();

    const unknown = setup({ kind: 'unknown' });
    const pending = await unknown.service.syncFromGateway('order-1', user);
    expect(pending.status).toBe(PaymentRecordStatus.PENDING);
    expect(unknown.dispatch).not.toHaveBeenCalled();
    await unknown.service.syncFromGateway('order-1', user);
    expect(unknown.captureOrder).toHaveBeenCalledTimes(1);
    expect(unknown.readOrder).toHaveBeenCalled();
    expect(unknown.dispatch).not.toHaveBeenCalled();
  });

  it('accepts a verified capture webhook and ignores a duplicate', async () => {
    const ctx = setup();
    ctx.paypal.verifyWebhook.mockResolvedValue({
      valid: true,
      paymentReference: 'PAY-1',
      status: 'SUCCESS',
      amount: '12.00',
      providerTransactionId: 'CAP1',
      rawPayload: { event_type: 'PAYMENT.CAPTURE.COMPLETED' },
    });
    const first = await ctx.service.handleWebhook('paypal', captureEvent(), paypalHeaders());
    expect(first.ok).toBe(true);
    expect(first.duplicate).toBeUndefined();
    expect(ctx.captureOrder).not.toHaveBeenCalled();
    expect(ctx.dispatch).toHaveBeenCalledTimes(1);

    const second = await ctx.service.handleWebhook('paypal', captureEvent(), paypalHeaders());
    expect(second.duplicate).toBe(true);
    expect(ctx.dispatch).toHaveBeenCalledTimes(1);
    expect(ctx.captureOrder).not.toHaveBeenCalled();
  });

  it('rejects an invalid webhook signature', async () => {
    const ctx = setup();
    ctx.paypal.verifyWebhook.mockResolvedValue({
      valid: false,
      paymentReference: 'PAY-1',
      status: 'PENDING',
      rawPayload: {},
    });
    await expect(ctx.service.handleWebhook('paypal', captureEvent(), paypalHeaders())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(ctx.dispatch).not.toHaveBeenCalled();
    expect(ctx.paymentRepository.claimPendingStatus).not.toHaveBeenCalled();
  });

  it('captures from the webhook when it arrives before the browser returns', async () => {
    const ctx = setup();
    ctx.paypal.verifyWebhook.mockResolvedValue({
      valid: true,
      paymentReference: 'PAY-1',
      status: 'PENDING',
      rawPayload: { paypalEvent: 'CHECKOUT.ORDER.APPROVED', paypalOrderId: 'PP1' },
    });
    await ctx.service.handleWebhook('paypal', { event_type: 'CHECKOUT.ORDER.APPROVED' }, paypalHeaders());
    expect(ctx.captureOrder).toHaveBeenCalledTimes(1);
    expect(ctx.dispatch).toHaveBeenCalledTimes(1);
    const back = await ctx.service.syncFromGateway('order-1', user);
    expect(back.status).toBe(PaymentRecordStatus.SUCCESS);
    expect(ctx.captureOrder).toHaveBeenCalledTimes(1);
    expect(ctx.dispatch).toHaveBeenCalledTimes(1);
  });

  it('lets the return capture win when it arrives before the webhook', async () => {
    const ctx = setup();
    await ctx.service.syncFromGateway('order-1', user);
    ctx.paypal.verifyWebhook.mockResolvedValue({
      valid: true,
      paymentReference: 'PAY-1',
      status: 'SUCCESS',
      amount: '12.00',
      providerTransactionId: 'CAP1',
      rawPayload: { event_type: 'PAYMENT.CAPTURE.COMPLETED' },
    });
    const webhook = await ctx.service.handleWebhook('paypal', captureEvent(), paypalHeaders());
    expect(webhook.duplicate).toBe(true);
    expect(ctx.captureOrder).toHaveBeenCalledTimes(1);
    expect(ctx.dispatch).toHaveBeenCalledTimes(1);
  });

  it('enqueues fulfillment for a successful payment that was not queued yet', async () => {
    const ctx = setup();
    ctx.setStatus(PaymentRecordStatus.SUCCESS);
    ctx.setStored({
      paypalOrderId: 'PP1',
      captureState: 'CAPTURED',
      captureId: 'CAP1',
      fulfillmentQueued: false,
    });
    const result = await ctx.service.syncFromGateway('order-1', user);
    expect(result.status).toBe(PaymentRecordStatus.SUCCESS);
    expect(ctx.captureOrder).not.toHaveBeenCalled();
    expect(ctx.dispatch).toHaveBeenCalledTimes(1);
    expect(airalo.createOrder).not.toHaveBeenCalled();
  });

  it('records an admin-test skip and does not enqueue fulfillment after capture', async () => {
    const ctx = setup(completed(), { adminTest: true, customerId: 'admin-1' });
    ctx.setStatus(PaymentRecordStatus.SUCCESS);
    ctx.setStored({
      paypalOrderId: 'PP1',
      captureState: 'CAPTURED',
      captureId: 'CAP1',
      fulfillmentQueued: false,
    });
    const result = await ctx.service.syncFromGateway('order-1', user);
    expect(result.status).toBe(PaymentRecordStatus.SUCCESS);
    expect(ctx.dispatch).not.toHaveBeenCalled();
    expect(ctx.paymentRepository.updateGatewayResponse).toHaveBeenCalledWith(
      'pay-1',
      expect.objectContaining({ fulfillmentSkipped: 'ADMIN_TEST' }),
    );
    expect(ctx.current().gatewayResponse).toMatchObject({ fulfillmentSkipped: 'ADMIN_TEST' });
    expect(ctx.current().gatewayResponse).not.toMatchObject({ fulfillmentQueued: true });
    const again = await ctx.service.syncFromGateway('order-1', user);
    expect(again.status).toBe(PaymentRecordStatus.SUCCESS);
    expect(ctx.dispatch).not.toHaveBeenCalled();
  });

  it('marks SUCCESS for a 1.00 USD capture without using the 103000 VND catalog total', async () => {
    const ctx = setup(
      { kind: 'completed', captureId: 'CAP1', amount: '1.00', currency: 'USD' },
      {
        adminTest: true,
        adminTestCharge: {
          currency: 'USD',
          amount: '1.00',
          mode: 'sandbox',
          catalogCurrency: 'VND',
          catalogSellAmountVnd: '103000',
        },
      },
      { payment: '1.00', order: '103000' },
    );
    const result = await ctx.service.syncFromGateway('order-1', user);
    expect(result.status).toBe(PaymentRecordStatus.SUCCESS);
    expect(ctx.dispatch).not.toHaveBeenCalled();
    expect(ctx.paymentRepository.updateGatewayResponse).toHaveBeenCalledWith(
      'pay-1',
      expect.objectContaining({ fulfillmentSkipped: 'ADMIN_TEST' }),
    );
    expect(airalo.createOrder).not.toHaveBeenCalled();
  });

  it('does not mark SUCCESS when the capture amount is the catalog number or the currency is not USD', async () => {
    const wrongAmount = setup(
      { kind: 'completed', captureId: 'CAP1', amount: '103000.00', currency: 'USD' },
      { adminTest: true },
      { payment: '1.00', order: '103000' },
    );
    const amountResult = await wrongAmount.service.syncFromGateway('order-1', user);
    expect(amountResult.status).toBe(PaymentRecordStatus.PENDING);
    expect(wrongAmount.dispatch).not.toHaveBeenCalled();

    const wrongCurrency = setup(
      { kind: 'completed', captureId: 'CAP1', amount: '1.00', currency: 'EUR' },
      { adminTest: true },
      { payment: '1.00', order: '103000' },
    );
    const currencyResult = await wrongCurrency.service.syncFromGateway('order-1', user);
    expect(currencyResult.status).toBe(PaymentRecordStatus.PENDING);
    expect(wrongCurrency.dispatch).not.toHaveBeenCalled();
    expect(airalo.createOrder).not.toHaveBeenCalled();
  });

  it('does not treat a non-boolean adminTest marker as a test order', async () => {
    const ctx = setup(completed(), { adminTest: 'true' });
    ctx.setStatus(PaymentRecordStatus.SUCCESS);
    ctx.setStored({
      paypalOrderId: 'PP1',
      captureState: 'CAPTURED',
      fulfillmentQueued: false,
    });
    await ctx.service.syncFromGateway('order-1', user);
    expect(ctx.dispatch).toHaveBeenCalledTimes(1);
    expect(ctx.current().gatewayResponse).toMatchObject({ fulfillmentQueued: true });
  });
});

describe('PayPal does not change SePay or P6', () => {
  it('keeps Vietnam eSIM on SePay and cards on the VN-only market', () => {
    expect(
      evaluateEsimMarketPayment({ market: 'VN', currency: 'VND', gateway: 'SEPAY', homeService: 'ESIM' }).ok,
    ).toBe(true);
    expect(evaluateEsimMarketPayment({ market: 'VN', currency: 'VND', gateway: 'PAYPAL' }).ok).toBe(false);
    expect(evaluateEsimMarketPayment({ market: 'INTL', currency: 'USD', gateway: 'PAYPAL', homeService: 'ESIM' }).ok).toBe(
      true,
    );
    expect(resolveRetailMarket('US')).toBe('INTL');
    expect(retailMarketAllowsHomeService('INTL', 'GAME_CARD')).toBe(false);
    expect(retailMarketAllowsHomeService('INTL', 'PHONE_CARD')).toBe(false);
    expect(retailMarketAllowsHomeService('INTL', 'TOPUP')).toBe(false);
    expect(retailMarketAllowsHomeService('INTL', 'DATA')).toBe(false);
    expect(retailMarketAllowsHomeService('VN', 'GAME_CARD')).toBe(true);
    expect(retailMarketAllowsHomeService('INTL', 'ESIM')).toBe(true);
  });

  it('does not call Airalo from the PayPal provider', () => {
    const source = [
      'paypal.provider.ts',
      'paypal.client.ts',
      'paypal.rules.ts',
    ]
      .map((file) => readFileSync(join(__dirname, file), 'utf8'))
      .join('\n');
    expect(source).not.toMatch(/esim-airalo|ESIM_PROVIDER_PORT|airaloNumericId/);
    expect(airalo.createOrder).not.toHaveBeenCalled();
  });
});

function completed(): PaypalObservation {
  return { kind: 'completed', captureId: 'CAP1', amount: '12.00', currency: 'USD' };
}

function createParams() {
  return {
    paymentReference: 'PAY-1',
    amount: '12.00',
    orderId: 'order-1',
    gateway: PaymentGatewayCode.PAYPAL,
    currency: 'USD',
  };
}

function captureEvent() {
  return {
    event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource: {
      id: 'CAP1',
      status: 'COMPLETED',
      custom_id: 'PAY-1',
      amount: { currency_code: 'USD', value: '12.00' },
      supplementary_data: { related_ids: { order_id: 'PP1' } },
    },
  };
}

function paypalHeaders(): Record<string, string> {
  return {
    'paypal-transmission-id': 'tx',
    'paypal-transmission-sig': 'sig',
    'paypal-transmission-time': 'time',
    'paypal-cert-url': 'https://example.com/cert',
    'paypal-auth-algo': 'SHA256withRSA',
  };
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

const httpCalls: string[] = [];

function fetchMock(status: number): PaypalFetch {
  return async (url: string) => {
    const href = String(url);
    httpCalls.push(href);
    if (href.endsWith('/v1/oauth2/token')) {
      return jsonResponse(200, { access_token: 'tok' }) as Response;
    }
    if (status >= 400) return jsonResponse(status, { name: 'INTERNAL' });
    return jsonResponse(201, {
      id: 'PP1',
      status: 'CREATED',
      links: [{ rel: 'approve', href: 'https://www.sandbox.paypal.com/checkoutnow?token=PP1' }],
    });
  };
}
