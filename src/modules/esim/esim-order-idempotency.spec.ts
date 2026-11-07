import { FulfillmentStatus, OrderPaymentStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { EsimOrderService } from './esim-order.service';
import { esimOrderCreateLockPair, isReusableEsimOrder } from './esim-order-idempotency';

describe('eSIM order reuse rules', () => {
  const now = new Date('2026-10-26T08:00:00.000Z');

  it('reuses an unpaid order that has not expired', () => {
    expect(
      isReusableEsimOrder(
        {
          paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
          fulfillmentStatus: FulfillmentStatus.PENDING,
          paymentExpiresAt: new Date('2026-10-26T08:10:00.000Z'),
        },
        now,
      ),
    ).toBe(true);
  });

  it('does not reuse an expired unpaid order', () => {
    expect(
      isReusableEsimOrder(
        {
          paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
          fulfillmentStatus: FulfillmentStatus.PENDING,
          paymentExpiresAt: new Date('2026-10-26T07:59:00.000Z'),
        },
        now,
      ),
    ).toBe(false);
  });

  it('reuses a paid order that is still processing or unconfirmed', () => {
    expect(
      isReusableEsimOrder({
        paymentStatus: OrderPaymentStatus.PAID,
        fulfillmentStatus: FulfillmentStatus.PENDING,
      }),
    ).toBe(true);
    expect(
      isReusableEsimOrder({
        paymentStatus: OrderPaymentStatus.PAID,
        fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW,
      }),
    ).toBe(true);
  });

  it('does not reuse a completed paid order so a later repurchase can start', () => {
    expect(
      isReusableEsimOrder({
        paymentStatus: OrderPaymentStatus.PAID,
        fulfillmentStatus: FulfillmentStatus.COMPLETED,
      }),
    ).toBe(false);
  });

  it('builds a stable advisory lock pair', () => {
    expect(esimOrderCreateLockPair(' user-1 ', ' variant-1 ')).toEqual([
      'esim-order:user-1',
      'variant-1',
    ]);
  });
});

describe('EsimOrderService create reuse', () => {
  const customer = { id: 'user-1', email: 'a@test.invalid', role: 'CUSTOMER' };
  const waitingOrder = {
    id: 'order-reuse',
    orderCode: 'CO-REUSE',
    channel: 'B2C',
    isGuestOrder: false,
    guestEmail: 'a@test.invalid',
    guestPhone: null,
    invoiceRequired: false,
    invoiceMetadata: {},
    customerNote: null,
    totalAmount: new Decimal(100000),
    faceValue: new Decimal(100000),
    sellAmount: new Decimal(100000),
    discountAmount: new Decimal(0),
    paymentMethodCode: 'SEPAY',
    methodDisplayName: 'SePay',
    paymentGateway: 'SEPAY',
    settlementType: 'BANK_TRANSFER',
    paymentFeePercent: new Decimal(0),
    paymentFeeFixed: new Decimal(0),
    paymentFeeAmount: new Decimal(0),
    customerPaid: new Decimal(100000),
    providerCost: new Decimal(90000),
    profit: new Decimal(10000),
    paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
    fulfillmentStatus: FulfillmentStatus.PENDING,
    paymentExpiresAt: new Date(Date.now() + 10 * 60_000),
    createdAt: new Date(),
    orderItems: [{ id: 'item-1', variantId: 'variant-1', quantity: 1, variant: { sku: 'KR', name: '1GB' } }],
  };

  function harness(
    store: { current: typeof waitingOrder | null },
    settingsEnabled = true,
  ) {
    const locks: string[] = [];
    let chain = Promise.resolve();
    const createFinancialTransaction = jest.fn().mockResolvedValue({ id: 'fin-1' });
    const createWithTransaction = jest.fn().mockImplementation(async () => {
      const created = { ...waitingOrder, id: 'order-new', orderCode: 'CO-NEW' };
      store.current = created;
      return created;
    });
    const createOrderItem = jest.fn().mockResolvedValue({ id: 'item-1' });
    const quoteCreate = jest.fn().mockResolvedValue({});
    const service = new EsimOrderService(
      {
        $transaction: (fn: (tx: unknown) => Promise<unknown>) => {
          const run = chain.then(() =>
            fn({
              $executeRaw: async () => {
                locks.push('advisory');
                return 1;
              },
              esimOrderQuote: { create: quoteCreate },
              order: {
                findMany: async () => (store.current ? [store.current] : []),
                findFirst: async () => store.current,
              },
            }),
          );
          chain = run.then(
            () => undefined,
            () => undefined,
          );
          return run;
        },
        providerProductMapping: {
          findFirst: async () => ({
            provider: { id: 'airalo-1' },
            providerProductCode: 'jang-7days-1gb',
            providerCost: 90000,
          }),
        },
      } as never,
      { createFinancialTransaction, createWithTransaction, createOrderItem } as never,
      {
        findActiveById: async () => ({ id: 'variant-1', type: 'ESIM', faceValue: 100000 }),
      } as never,
      { getCustomerPrice: async () => '100000' } as never,
      { listForVariant: jest.fn() } as never,
      {
        resolveSystemConfig: () => ({ customerEsimEnabled: settingsEnabled }),
        getPublicPaymentMethods: () => [{ methodCode: 'SEPAY' }],
        resolvePaymentMethod: () => ({
          methodCode: 'SEPAY',
          displayName: 'SePay',
          gatewayCode: 'SEPAY',
          settlementType: 'BANK_TRANSFER',
          percentageFee: 0,
          fixedFee: 0,
        }),
      } as never,
      {
        get: (key: string) =>
          ({ 'esim.enabled': true, 'esim.providerMode': 'mock', 'esim.liveArm': false })[key],
      } as never,
    );
    return {
      service,
      locks,
      createWithTransaction,
      quoteCreate,
    };
  }

  it('returns the existing in-flight order on a duplicate request and does not create again', async () => {
    const store = { current: waitingOrder };
    const { service, createWithTransaction, quoteCreate, locks } = harness(store);
    const first = await service.create(
      { items: [{ variantId: 'variant-1', quantity: 1 }], paymentMethodCode: 'SEPAY' } as never,
      customer as never,
    );
    const retry = await service.create(
      { items: [{ variantId: 'variant-1', quantity: 1 }], paymentMethodCode: 'SEPAY' } as never,
      customer as never,
    );
    expect(first.id).toBe('order-reuse');
    expect(retry.id).toBe('order-reuse');
    expect(createWithTransaction).not.toHaveBeenCalled();
    expect(quoteCreate).not.toHaveBeenCalled();
    expect(locks).toEqual(['advisory', 'advisory']);
  });

  it('serializes concurrent creates so only one order is written', async () => {
    const store = { current: null as typeof waitingOrder | null };
    const { service, createWithTransaction } = harness(store);
    const [a, b] = await Promise.all([
      service.create(
        { items: [{ variantId: 'variant-1', quantity: 1 }], paymentMethodCode: 'SEPAY' } as never,
        customer as never,
      ),
      service.create(
        { items: [{ variantId: 'variant-1', quantity: 1 }], paymentMethodCode: 'SEPAY' } as never,
        customer as never,
      ),
    ]);
    expect(a.id).toBe(b.id);
    expect(createWithTransaction).toHaveBeenCalledTimes(1);
  });

  it('creates a new order after the previous unpaid window expired', async () => {
    const expired = {
      ...waitingOrder,
      paymentExpiresAt: new Date(Date.now() - 60_000),
    };
    const store = { current: expired };
    const { service, createWithTransaction } = harness(store);
    const created = await service.create(
      { items: [{ variantId: 'variant-1', quantity: 1 }], paymentMethodCode: 'SEPAY' } as never,
      customer as never,
    );
    expect(createWithTransaction).toHaveBeenCalledTimes(1);
    expect(created.id).toBe('order-new');
  });

  it('reuses a SUPER_ADMIN test order when customer sales are off', async () => {
    const store = { current: waitingOrder };
    const { service, createWithTransaction, quoteCreate } = harness(store, false);
    const superAdmin = { id: 'user-1', email: 'sa@test.invalid', role: 'SUPER_ADMIN' };
    const first = await service.createAdminTest(
      { items: [{ variantId: 'variant-1', quantity: 1 }], paymentMethodCode: 'SEPAY' } as never,
      superAdmin as never,
    );
    const retry = await service.createAdminTest(
      { items: [{ variantId: 'variant-1', quantity: 1 }], paymentMethodCode: 'SEPAY' } as never,
      superAdmin as never,
    );
    expect(first.id).toBe('order-reuse');
    expect(retry.id).toBe('order-reuse');
    expect(createWithTransaction).not.toHaveBeenCalled();
    expect(quoteCreate).not.toHaveBeenCalled();
  });
});
