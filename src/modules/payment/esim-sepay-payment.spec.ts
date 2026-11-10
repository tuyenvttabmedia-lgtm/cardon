import { createHmac } from 'crypto';
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
import { EsimSepayPaymentService } from './services/esim-sepay-payment.service';
import {
  ESIM_SEPAY_SANDBOX_CHECKOUT_URL,
  ESIM_SEPAY_SIGNED_FIELD_ORDER,
  buildEsimSepaySignedPayload,
  signEsimSepayCheckout,
} from './providers/sepay/esim-sepay-checkout';
import { readEsimSepayGatewayConfig } from './providers/sepay/esim-sepay-sandbox.config';
import * as sepayPg from './providers/sepay/sepay.pg';
import { getSepayPgCheckoutUrl, signSepayPgFields } from './providers/sepay/sepay.pg';
import { evaluateEsimSepayIpn, redactEsimSepayIpn } from './providers/sepay/esim-sepay-ipn';
import { PaymentProviderRegistry } from './providers/payment-provider.registry';
import { MockMegaPayProvider, MockSePayProvider } from './providers/mock-payment.providers';

const SECRET = 'spsk_test_unit_only';
const IPN_SECRET = 'ipn-unit-secret';

function gatewayInput(overrides: Record<string, string> = {}) {
  return {
    environment: 'sandbox',
    merchantId: 'merchant-sandbox',
    merchantSecret: SECRET,
    ipnSecret: IPN_SECRET,
    publicUrl: 'http://localhost',
    ...overrides,
  };
}

function gatewayStub(overrides: Record<string, string> = {}) {
  const input = gatewayInput(overrides);
  return {
    getPaymentGateway: () => ({
      enabled: true,
      merchantId: input.merchantId,
      merchantSecretKey: input.merchantSecret,
      ipnSecretKey: input.ipnSecret,
      environment: input.environment as 'sandbox' | 'production',
      paymentMethod: 'BANK_TRANSFER' as const,
      publicUrl: input.publicUrl,
    }),
  };
}

function body(overrides: { order?: object; transaction?: object; notification_type?: string } = {}) {
  return {
    notification_type: overrides.notification_type ?? 'ORDER_PAID',
    order: {
      order_invoice_number: 'ESIMABC',
      order_status: 'CAPTURED',
      order_currency: 'VND',
      order_amount: '100000.00',
      ...overrides.order,
    },
    transaction: {
      id: 'txn-1',
      transaction_status: 'APPROVED',
      transaction_currency: 'VND',
      transaction_amount: '100000.00',
      card_number: '411111******1111',
      ...overrides.transaction,
    },
  };
}

describe('eSIM SePay signer and sandbox config', () => {
  const fields = {
    order_amount: '100000',
    merchant: 'merchant-sandbox',
    currency: 'VND',
    operation: 'PURCHASE',
    order_description: 'CardOn eSIM',
    order_invoice_number: 'ESIMABC',
    customer_id: 'user-1',
    payment_method: 'BANK_TRANSFER',
    success_url: 'http://localhost/checkout/result?orderId=1',
    error_url: 'http://localhost/checkout/result?orderId=1&payment=error',
    cancel_url: 'http://localhost/checkout/result?orderId=1&payment=cancel',
  };

  it('signs the official field order and changes when amount or invoice changes', () => {
    expect(ESIM_SEPAY_SIGNED_FIELD_ORDER[0]).toBe('order_amount');
    const payload = buildEsimSepaySignedPayload(fields);
    expect(payload.startsWith('order_amount=100000,merchant=merchant-sandbox,currency=VND')).toBe(true);
    const signature = signEsimSepayCheckout(fields, SECRET);
    expect(signature).toBe(createHmac('sha256', SECRET).update(payload).digest('base64'));
    expect(signEsimSepayCheckout({ ...fields, order_amount: '100001' }, SECRET)).not.toBe(signature);
    expect(signEsimSepayCheckout({ ...fields, order_invoice_number: 'ESIMOTHER' }, SECRET)).not.toBe(signature);
    expect(payload.includes(SECRET)).toBe(false);
  });

  it('aligns the retail signer with the official SePay / eSIM field order', () => {
    const source = readFileSync(join(__dirname, 'providers/sepay/sepay.pg.ts'), 'utf8').replace(/\r\n/g, '\n');
    expect(source).toContain(`const SIGNED_FIELD_ORDER = [
  'order_amount',
  'merchant',
  'currency',
  'operation',`);
    expect(signSepayPgFields(fields, SECRET)).toBe(signEsimSepayCheckout(fields, SECRET));
  });

  it('uses the sandbox or production checkout host from the same gateway fields', () => {
    const sandbox = readEsimSepayGatewayConfig(gatewayInput());
    expect(sandbox.ok).toBe(true);
    if (sandbox.ok) {
      expect(sandbox.config.checkoutUrl).toBe(ESIM_SEPAY_SANDBOX_CHECKOUT_URL);
      expect(sandbox.config.checkoutUrl).toBe(getSepayPgCheckoutUrl('sandbox'));
    }
    const live = readEsimSepayGatewayConfig(gatewayInput({
      environment: 'production',
      merchantSecret: 'spsk_live_unit_only',
    }));
    expect(live.ok).toBe(true);
    if (live.ok) {
      expect(live.config.checkoutUrl).toBe(getSepayPgCheckoutUrl('production'));
    }
    expect(readEsimSepayGatewayConfig({}).ok).toBe(false);
    expect(readEsimSepayGatewayConfig(gatewayInput({ merchantSecret: 'spsk_live_secret' })).ok).toBe(false);
    expect(readEsimSepayGatewayConfig(gatewayInput({
      environment: 'production',
      merchantSecret: 'spsk_test_secret',
    })).ok).toBe(false);
    expect(readEsimSepayGatewayConfig(gatewayInput({ merchantId: '' })).ok).toBe(false);
  });
});

describe('eSIM SePay IPN contract', () => {
  const expected = { invoiceNumber: 'ESIMABC', amount: new Decimal('100000.00') };

  it('accepts the captured VND payment and drops card data', () => {
    const payload = body();
    expect(evaluateEsimSepayIpn(payload, expected).ok).toBe(true);
    const redacted = JSON.stringify(redactEsimSepayIpn(payload));
    expect(redacted).not.toContain('411111');
  });

  it.each([
    ['invoice', { order: { order_invoice_number: 'OTHER' } }, 'INVOICE'],
    ['amount', { order: { order_amount: '1.00' } }, 'AMOUNT'],
    ['currency', { order: { order_currency: 'USD' } }, 'CURRENCY'],
    ['transaction status', { transaction: { transaction_status: 'PENDING' } }, 'TRANSACTION_STATUS'],
    ['order status', { order: { order_status: 'PENDING' } }, 'ORDER_STATUS'],
    ['notification', { notification_type: 'TRANSACTION_VOID' }, 'NOTIFICATION_TYPE'],
  ] as const)('rejects a wrong %s', (_label, overrides, reason) => {
    expect(evaluateEsimSepayIpn(body(overrides), expected)).toMatchObject({ ok: false, reason });
  });
});

describe('EsimSepayPaymentService', () => {

  function vndOrder(overrides: Record<string, unknown> = {}) {
    return {
      id: 'order-1',
      orderCode: 'ORD-1',
      userId: 'user-1',
      paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
      paymentExpiresAt: new Date(Date.now() + 600_000),
      catalogCurrency: 'VND',
      catalogAmount: new Decimal(103000),
      chargeCurrency: 'VND',
      chargeAmount: new Decimal(103000),
      totalAmount: new Decimal(103000),
      fxRateId: null,
      paymentMethodCode: 'SEPAY',
      settlementType: null,
      ...overrides,
    };
  }

  function harness(order = vndOrder()) {
    let paymentStatus: PaymentRecordStatus = PaymentRecordStatus.PENDING;
    let secondStatus: PaymentRecordStatus = PaymentRecordStatus.PENDING;
    let orderStatus: OrderPaymentStatus = order.paymentStatus;
    let providerTx: string | null = null;
    let expiresAt = order.paymentExpiresAt as Date | null;
    let created: Record<string, unknown> | null = null;
    let gatewayResponse: Record<string, unknown> = {};
    let chain: Promise<unknown> = Promise.resolve();
    const row = (id: 'pay-1' | 'pay-2') => ({
      id,
      orderId: order.id,
      gateway: PaymentGatewayCode.SEPAY,
      productLane: 'ESIM',
      paymentReference: id === 'pay-1' ? (created?.paymentReference as string | undefined) ?? 'ESIMABC' : 'ESIMSECOND',
      amount: order.chargeAmount,
      currency: 'VND',
      status: id === 'pay-1' ? paymentStatus : secondStatus,
      gatewayTransactionId: id === 'pay-1' ? providerTx : null,
      expiresAt,
      paidAt: null,
      createdAt: new Date(),
      gatewayResponse: { ...gatewayResponse },
      order: { ...order, paymentStatus: orderStatus, paymentExpiresAt: expiresAt },
      deletedAt: null,
    });
    const tx = {
      $executeRaw: jest.fn(),
      payment: {
        findFirst: jest.fn(async (args: { where: Record<string, unknown>; select?: Record<string, unknown> }) => {
          const where = args.where ?? {};
          if (where.gatewayTransactionId) return null;
          // createFromSnapshot open-payment probe uses status: { in: [...] } — no row yet.
          if (where.status && typeof where.status === 'object' && 'in' in (where.status as object)) {
            return created ? row('pay-1') : null;
          }
          if (where.status && typeof where.status === 'object') {
            const statusFilter = where.status as { not?: PaymentRecordStatus };
            if (statusFilter.not === PaymentRecordStatus.SUCCESS && paymentStatus === PaymentRecordStatus.SUCCESS) {
              return null;
            }
          }
          if (args.select) {
            return {
              gatewayResponse: { ...gatewayResponse },
              amount: order.chargeAmount,
            };
          }
          if (where.paymentReference === 'ESIMSECOND' || where.id === 'pay-2') return row('pay-2');
          if (where.paymentReference && where.paymentReference !== row('pay-1').paymentReference) return null;
          return row('pay-1');
        }),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          gatewayResponse =
            data.gatewayResponse && typeof data.gatewayResponse === 'object'
              ? { ...(data.gatewayResponse as Record<string, unknown>) }
              : {};
          created = {
            ...row('pay-1'),
            ...data,
            id: 'pay-1',
            status: PaymentRecordStatus.PENDING,
            paidAt: null,
            createdAt: new Date(),
          };
          return created;
        }),
        update: jest.fn(async ({ data }: { data: { gatewayResponse?: Record<string, unknown> } }) => {
          if (data.gatewayResponse && typeof data.gatewayResponse === 'object') {
            gatewayResponse = { ...data.gatewayResponse };
          }
          return row('pay-1');
        }),
        updateMany: jest.fn(async ({ where, data }: {
          where: { id?: string; status?: string | { not?: PaymentRecordStatus } };
          data: {
            status?: PaymentRecordStatus;
            gatewayTransactionId?: string;
            gatewayResponse?: Record<string, unknown>;
          };
        }) => {
          if (data.gatewayResponse && typeof data.gatewayResponse === 'object') {
            gatewayResponse = { ...data.gatewayResponse };
            return { count: paymentStatus === PaymentRecordStatus.SUCCESS ? 0 : 1 };
          }
          if (data.status === PaymentRecordStatus.SUCCESS) {
            if (where.id === 'pay-2') return { count: 0 };
            if (where.status === PaymentRecordStatus.PENDING && paymentStatus === PaymentRecordStatus.PENDING) {
              paymentStatus = PaymentRecordStatus.SUCCESS;
              providerTx = data.gatewayTransactionId ?? null;
              return { count: 1 };
            }
            return { count: 0 };
          }
          return { count: 1 };
        }),
      },
      order: {
        findFirst: jest.fn(async () => ({ ...order, paymentStatus: orderStatus, paymentExpiresAt: expiresAt })),
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
      ...tx,
      $transaction: (fn: (client: typeof tx) => Promise<unknown>) => {
        const run = chain.then(async () => {
          const snap = { paymentStatus, orderStatus, providerTx };
          try {
            return await fn(tx);
          } catch (error) {
            paymentStatus = snap.paymentStatus;
            orderStatus = snap.orderStatus;
            providerTx = snap.providerTx;
            throw error;
          }
        });
        chain = run.then(() => undefined, () => undefined);
        return run;
      },
    };
    const fulfillment = { dispatchOrderFulfillment: jest.fn().mockResolvedValue(['esim-fulfill-order-1']) };
    const notification = { notifyPaymentSuccess: jest.fn() };
    const service = new EsimSepayPaymentService(
      prisma as never,
      fulfillment as never,
      notification as never,
      gatewayStub() as never,
    );
    return {
      service,
      prisma,
      fulfillment,
      notification,
      state: () => ({ paymentStatus, orderStatus, secondStatus }),
      markOrderPaid: () => {
        orderStatus = OrderPaymentStatus.PAID;
      },
      expire: () => {
        expiresAt = new Date(Date.now() - 60_000);
      },
    };
  }

  it('creates a VND eSIM payment from the snapshot', async () => {
    const { service, prisma } = harness();
    const view = await service.createFromSnapshot({
      orderId: 'order-1',
      gateway: PaymentGatewayCode.SEPAY,
      idempotencyKey: 'key-1',
      userId: 'user-1',
    });
    const data = prisma.payment.create.mock.calls[0][0].data as {
      amount: { toString(): string };
      currency: string;
      productLane: string;
      fxRateId: string | null;
      paymentReference: string;
    };
    expect(data.amount.toString()).toBe('103000');
    expect(data.currency).toBe('VND');
    expect(data.productLane).toBe('ESIM');
    expect(data.fxRateId).toBeNull();
    expect(data.paymentReference.startsWith('ESIM')).toBe(true);
    expect(data.paymentReference.startsWith('DH')).toBe(false);
    expect(view.checkoutUrl).toBe(ESIM_SEPAY_SANDBOX_CHECKOUT_URL);
    expect(JSON.stringify(view.checkoutFormFields)).not.toContain(SECRET);
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { paymentId: 'pay-1' },
    });
  });

  it('rejects a missing snapshot, a non-VND charge, PayPal, and a missing secret', async () => {
    const missing = harness(vndOrder({ chargeAmount: null, chargeCurrency: null }));
    await expect(missing.service.createFromSnapshot({
      orderId: 'order-1',
      gateway: PaymentGatewayCode.SEPAY,
      idempotencyKey: 'key-1',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(missing.prisma.payment.create).not.toHaveBeenCalled();

    const usd = harness(vndOrder({ chargeCurrency: 'USD', chargeAmount: new Decimal('1.00'), totalAmount: new Decimal(103000) }));
    await expect(usd.service.createFromSnapshot({
      orderId: 'order-1',
      gateway: PaymentGatewayCode.SEPAY,
      idempotencyKey: 'key-1',
    })).rejects.toBeInstanceOf(BadRequestException);

    const paypal = harness();
    await expect(paypal.service.createFromSnapshot({
      orderId: 'order-1',
      gateway: PaymentGatewayCode.PAYPAL,
      idempotencyKey: 'key-1',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(paypal.prisma.payment.create).not.toHaveBeenCalled();

    const closed = harness();
    (closed.service as unknown as { sepayConfig: { getPaymentGateway: () => { enabled: boolean } } }).sepayConfig = {
      getPaymentGateway: () => ({ enabled: false }),
    };
    await expect(closed.service.createFromSnapshot({
      orderId: 'order-1',
      gateway: PaymentGatewayCode.SEPAY,
      idempotencyKey: 'key-1',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(closed.prisma.payment.create).not.toHaveBeenCalled();
  });

  it('settles one valid IPN and ignores a repeat, a bad secret, and a redirect sync', async () => {
    const { service, fulfillment, state } = harness();
    const created = await service.createFromSnapshot({
      orderId: 'order-1',
      gateway: PaymentGatewayCode.SEPAY,
      idempotencyKey: 'key-1',
    });
    const invoice = created.paymentReference;
    const payload = body({ order: { order_invoice_number: invoice, order_amount: '103000.00' }, transaction: { transaction_amount: '103000.00' } });
    await expect(service.handleIpn(payload, { 'x-secret-key': 'wrong' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(state().orderStatus).toBe(OrderPaymentStatus.WAITING_PAYMENT);

    const first = await service.handleIpn(payload, { 'x-secret-key': IPN_SECRET });
    const second = await service.handleIpn(payload, { 'x-secret-key': IPN_SECRET });
    expect(first.outcome).toBe('SETTLED');
    expect(second.outcome).toBe('DUPLICATE');
    expect(fulfillment.dispatchOrderFulfillment).toHaveBeenCalledTimes(1);
    expect(state().orderStatus).toBe(OrderPaymentStatus.PAID);
  });

  it('does not mark paid when the signed IPN amount, currency, or invoice is wrong', async () => {
    const { service, fulfillment, state } = harness();
    const created = await service.createFromSnapshot({
      orderId: 'order-1',
      gateway: PaymentGatewayCode.SEPAY,
      idempotencyKey: 'key-1',
    });
    const invoice = created.paymentReference;
    const headers = { 'x-secret-key': IPN_SECRET };
    await service.handleIpn(body({
      order: { order_invoice_number: invoice, order_amount: '1.00' },
      transaction: { transaction_amount: '1.00' },
    }), headers);
    await service.handleIpn(body({
      order: { order_invoice_number: invoice, order_currency: 'USD' },
      transaction: { transaction_currency: 'USD', transaction_amount: '103000.00' },
    }), headers);
    await service.handleIpn(body({ order: { order_invoice_number: 'ESIM-OTHER' } }), headers);
    expect(state().paymentStatus).toBe(PaymentRecordStatus.PENDING);
    expect(state().orderStatus).toBe(OrderPaymentStatus.WAITING_PAYMENT);
    expect(fulfillment.dispatchOrderFulfillment).not.toHaveBeenCalled();
  });

  it('lets only one of two concurrent IPNs settle and dispatch', async () => {
    const { service, fulfillment } = harness();
    const created = await service.createFromSnapshot({
      orderId: 'order-1',
      gateway: PaymentGatewayCode.SEPAY,
      idempotencyKey: 'key-1',
    });
    const payload = body({
      order: { order_invoice_number: created.paymentReference, order_amount: '103000.00' },
      transaction: { transaction_amount: '103000.00' },
    });
    const [left, right] = await Promise.all([
      service.handleIpn(payload, { 'x-secret-key': IPN_SECRET }),
      service.handleIpn(payload, { 'x-secret-key': IPN_SECRET }),
    ]);
    const outcomes = [left.outcome, right.outcome].sort();
    expect(outcomes).toEqual(['DUPLICATE', 'SETTLED']);
    expect(fulfillment.dispatchOrderFulfillment).toHaveBeenCalledTimes(1);
  });

  it('does not settle a second payment, a paid order, or an expired order', async () => {
    const { service, fulfillment, state, markOrderPaid, expire } = harness();
    const created = await service.createFromSnapshot({
      orderId: 'order-1',
      gateway: PaymentGatewayCode.SEPAY,
      idempotencyKey: 'key-1',
    });
    const headers = { 'x-secret-key': IPN_SECRET };
    const payload = body({
      order: { order_invoice_number: created.paymentReference, order_amount: '103000.00' },
      transaction: { transaction_amount: '103000.00' },
    });
    expect((await service.handleIpn(payload, headers)).outcome).toBe('SETTLED');

    const second = await service.handleIpn(body({
      order: { order_invoice_number: 'ESIMSECOND', order_amount: '103000.00' },
      transaction: { id: 'txn-2', transaction_amount: '103000.00' },
    }), headers);
    expect(second.outcome).toBe('IGNORED');
    expect(state().secondStatus).toBe(PaymentRecordStatus.PENDING);
    expect(fulfillment.dispatchOrderFulfillment).toHaveBeenCalledTimes(1);

    const later = harness();
    later.markOrderPaid();
    const afterPaid = await later.service.handleIpn(body({
      order: { order_amount: '103000.00' },
      transaction: { transaction_amount: '103000.00' },
    }), headers);
    expect(afterPaid.reason).toBe('EXPIRED');
    expect(later.fulfillment.dispatchOrderFulfillment).not.toHaveBeenCalled();

    const expired = harness();
    const expiredPayment = await expired.service.createFromSnapshot({
      orderId: 'order-1',
      gateway: PaymentGatewayCode.SEPAY,
      idempotencyKey: 'key-2',
    });
    expired.expire();
    const afterExpiry = await expired.service.handleIpn(body({
      order: { order_invoice_number: expiredPayment.paymentReference, order_amount: '103000.00' },
      transaction: { transaction_amount: '103000.00' },
    }), headers);
    expect(afterExpiry.reason).toBe('EXPIRED');
    expect(expired.state().paymentStatus).toBe(PaymentRecordStatus.PENDING);
    expect(expired.fulfillment.dispatchOrderFulfillment).not.toHaveBeenCalled();
  });

  it('settles from return-url sync when SePay PG reports CAPTURED', async () => {
    const box = harness();
    const created = await box.service.createFromSnapshot({
      orderId: 'order-1',
      gateway: PaymentGatewayCode.SEPAY,
      idempotencyKey: 'key-1',
    });
    const query = jest.spyOn(sepayPg, 'querySepayPgOrder').mockResolvedValue({
      status: 'SUCCESS',
      amount: '103000.00',
      providerOrderId: 'PAY-SEPAY-1',
      raw: { id: 'sepay-row-1', order_id: 'PAY-SEPAY-1' },
    });
    const result = await box.service.sync(created.id);
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceNumber: created.paymentReference }),
    );
    expect(result).toMatchObject({
      paymentReference: created.paymentReference,
      status: PaymentRecordStatus.SUCCESS,
      synced: true,
    });
    expect(box.fulfillment.dispatchOrderFulfillment).toHaveBeenCalledWith('order-1');
    query.mockRestore();
  });

  it('does not double-dispatch when return-url sync races the IPN', async () => {
    const box = harness();
    const created = await box.service.createFromSnapshot({
      orderId: 'order-1',
      gateway: PaymentGatewayCode.SEPAY,
      idempotencyKey: 'key-1',
    });
    const query = jest.spyOn(sepayPg, 'querySepayPgOrder').mockResolvedValue({
      status: 'SUCCESS',
      amount: '103000.00',
      providerOrderId: 'PAY-SEPAY-1',
      raw: { id: 'sepay-row-1' },
    });
    const payload = body({
      order: { order_invoice_number: created.paymentReference, order_amount: '103000.00' },
      transaction: { transaction_amount: '103000.00' },
    });
    const [ipn, sync] = await Promise.all([
      box.service.handleIpn(payload, { 'x-secret-key': IPN_SECRET }),
      box.service.sync(created.id),
    ]);
    expect(ipn.outcome).toBe('SETTLED');
    expect(sync.status).toBe(PaymentRecordStatus.SUCCESS);
    expect(box.fulfillment.dispatchOrderFulfillment).toHaveBeenCalledTimes(1);
    query.mockRestore();
  });
});

describe('eSIM checkout leaves retail payment and redirect sync alone', () => {
  function paymentService(orderItemType: string | null, esim?: { createFromSnapshot: jest.Mock }) {
    const prisma = {
      order: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'order-1',
          userId: 'user-1',
          totalAmount: new Decimal(100000),
          paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
          paymentExpiresAt: new Date(Date.now() + 600_000),
          deletedAt: null,
        }),
      },
      orderItem: {
        findMany: jest.fn().mockResolvedValue(
          orderItemType ? [{ variant: { type: orderItemType } }] : [],
        ),
      },
      payment: { create: jest.fn() },
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb({
        payment: {
          create: jest.fn().mockResolvedValue({
            id: 'pay-retail',
            orderId: 'order-1',
            gateway: PaymentGatewayCode.MEGAPAY,
            paymentReference: 'PAY-RETAIL',
            amount: new Decimal(100000),
            status: PaymentRecordStatus.PENDING,
            expiresAt: new Date(),
            gatewayResponse: { paymentUrl: 'https://mock.megapay.example/checkout/PAY-RETAIL' },
            paidAt: null,
            createdAt: new Date(),
          }),
        },
        order: { update: jest.fn() },
      })),
    };
    const fulfillment = { dispatchOrderFulfillment: jest.fn() };
    const repository = {
      findByIdempotencyKey: jest.fn(),
      findLatestByOrderId: jest.fn(),
    };
    const service = new PaymentService(
      prisma as never,
      repository as never,
      {} as never,
      PaymentProviderRegistry.withProviders(new MockMegaPayProvider(), new MockSePayProvider()),
      {} as never,
      { recordPaymentCreated: jest.fn() } as never,
      fulfillment as never,
      { notifyPaymentSuccess: jest.fn() } as never,
      { dispatch: jest.fn() } as never,
      undefined,
      esim as never,
    );
    return { service, prisma, fulfillment, repository };
  }

  it('sends an eSIM order to snapshot checkout and a card order through the retail path', async () => {
    const esim = { createFromSnapshot: jest.fn().mockResolvedValue({ id: 'esim-pay', amount: '103000' }) };
    const esimPayment = paymentService('ESIM', esim);
    await esimPayment.service.createPayment(
      { orderId: 'order-1', gateway: PaymentGatewayCode.SEPAY },
      'idem-esim',
      { id: 'user-1', email: 'u@test.com', role: 'CUSTOMER' },
    );
    expect(esim.createFromSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      gateway: PaymentGatewayCode.SEPAY,
      orderId: 'order-1',
    }));
    expect(esimPayment.prisma.$transaction).not.toHaveBeenCalled();

    const retail = paymentService('PHONE_CARD');
    const created = await retail.service.createPayment(
      { orderId: 'order-1', gateway: PaymentGatewayCode.MEGAPAY },
      'idem-retail',
      { id: 'user-1', email: 'u@test.com', role: 'CUSTOMER' },
    );
    expect(created.paymentReference).toBe('PAY-RETAIL');
    expect(created.amount).toBe('100000.00');
  });

  it('routes eSIM SePay return-url sync through the eSIM SePay service', async () => {
    const esim = {
      createFromSnapshot: jest.fn(),
      sync: jest.fn().mockResolvedValue({
        paymentReference: 'ESIMABC',
        status: PaymentRecordStatus.SUCCESS,
        synced: true,
      }),
    };
    const { service, fulfillment, repository } = paymentService(null, esim);
    repository.findLatestByOrderId.mockResolvedValue({
      id: 'pay-1',
      orderId: 'order-1',
      gateway: PaymentGatewayCode.SEPAY,
      productLane: 'ESIM',
      paymentReference: 'ESIMABC',
      status: PaymentRecordStatus.PENDING,
      order: { userId: 'user-1' },
    });
    const result = await service.syncFromGateway('order-1', {
      id: 'user-1',
      email: 'u@test.com',
      role: 'CUSTOMER',
    });
    expect(esim.sync).toHaveBeenCalledWith('pay-1');
    expect(result).toMatchObject({ status: PaymentRecordStatus.SUCCESS, synced: true });
    expect(fulfillment.dispatchOrderFulfillment).not.toHaveBeenCalled();
  });
});
