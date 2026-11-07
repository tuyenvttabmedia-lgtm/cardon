import { OrderPaymentStatus, FulfillmentStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { EsimOrderService } from './esim-order.service';

describe('INTL USD snapshot on eSIM create', () => {
  const customer = { id: 'user-1', email: 'a@test.invalid', role: 'CUSTOMER' };

  function fxRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'fx-1',
      status: 'EFFECTIVE',
      rate: new Decimal('25000'),
      observedAt: new Date(),
      effectiveFrom: new Date(),
      effectiveTo: null,
      source: { maxStalenessSeconds: 86_400, baseCurrency: 'USD', quoteCurrency: 'VND' },
      ...overrides,
    };
  }

  function harness(options?: {
    countryIso?: string;
    costAmount?: string;
    sell?: string;
    fx?: Array<Record<string, unknown>>;
    gateway?: 'PAYPAL' | 'SEPAY';
  }) {
    const countryIso = options?.countryIso ?? 'KR';
    const gateway = options?.gateway ?? (countryIso === 'VN' ? 'SEPAY' : 'PAYPAL');
    const fxReads: number[] = [];
    const fx = options?.fx ?? [fxRow()];
    const store: { current: Record<string, unknown> | null } = { current: null };
    const createWithTransaction = jest.fn(async (_tx: unknown, input: Record<string, unknown>) => {
      const created = {
        id: 'order-new',
        orderCode: 'CO-NEW',
        channel: 'B2C',
        isGuestOrder: false,
        guestEmail: customer.email,
        guestPhone: null,
        invoiceRequired: false,
        invoiceMetadata: {},
        customerNote: null,
        totalAmount: input.totalAmount,
        faceValue: input.faceValue,
        sellAmount: input.sellAmount,
        discountAmount: input.discountAmount,
        paymentMethodCode: input.paymentMethodCode,
        methodDisplayName: gateway,
        paymentGateway: gateway,
        settlementType: 'GATEWAY_SETTLEMENT',
        paymentFeePercent: new Decimal(0),
        paymentFeeFixed: new Decimal(0),
        paymentFeeAmount: new Decimal(0),
        customerPaid: input.customerPaid,
        providerCost: input.providerCost,
        profit: input.profit,
        paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
        fulfillmentStatus: FulfillmentStatus.PENDING,
        paymentExpiresAt: new Date(Date.now() + 600_000),
        createdAt: new Date(),
        esimMarket: input.esimMarket,
        chargeCurrency: input.chargeCurrency,
        chargeAmount: input.chargeAmount,
        catalogCurrency: input.catalogCurrency,
        catalogAmount: input.catalogAmount,
        fxRateId: input.fxRateId,
        orderItems: [{ id: 'item-1', variantId: 'variant-1', quantity: 1, variant: { sku: 'KR', name: '1GB' } }],
      };
      store.current = created;
      return created;
    });
    const service = new EsimOrderService(
      {
        $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            $executeRaw: async () => 1,
            esimOrderQuote: { create: jest.fn().mockResolvedValue({}) },
            fxRate: {
              findMany: async () => {
                fxReads.push(1);
                return fx;
              },
            },
            order: {
              findMany: async () => (store.current ? [store.current] : []),
              findFirst: async () => store.current,
            },
          }),
        providerProductMapping: {
          findFirst: async () => ({
            provider: { id: 'airalo-1' },
            providerProductCode: 'pkg',
            providerCost: 90000,
          }),
        },
        esimAiraloPackage: {
          findFirst: async () => ({
            countryIso,
            destinationKey: countryIso.toLowerCase(),
            costCurrency: countryIso === 'VN' ? 'VND' : 'USD',
            costAmount: new Decimal(options?.costAmount ?? '3.5'),
          }),
        },
      } as never,
      { createFinancialTransaction: jest.fn().mockResolvedValue({ id: 'fin-1' }), createWithTransaction, createOrderItem: jest.fn().mockResolvedValue({ id: 'item-1' }) } as never,
      { findActiveById: async () => ({ id: 'variant-1', type: 'ESIM', faceValue: options?.sell ?? '100000' }) } as never,
      { getCustomerPrice: async () => options?.sell ?? '100000' } as never,
      { listForVariant: jest.fn() } as never,
      {
        resolveSystemConfig: () => ({ customerEsimEnabled: true }),
        getPublicPaymentMethods: () => [{ methodCode: gateway }],
        resolvePaymentMethod: () => ({
          methodCode: gateway,
          displayName: gateway,
          gatewayCode: gateway,
          settlementType: 'GATEWAY_SETTLEMENT',
          percentageFee: 0,
          fixedFee: 0,
        }),
      } as never,
      { get: (key: string) => ({ 'esim.enabled': true, 'esim.providerMode': 'mock' })[key] } as never,
    );
    return { service, createWithTransaction, fxReads, store };
  }

  function dto(extra: Record<string, unknown> = {}) {
    return {
      items: [{ variantId: 'variant-1', quantity: 1 }],
      paymentMethodCode: 'PAYPAL',
      market: 'INTL',
      ...extra,
    };
  }

  it('locks a USD charge from the published rate and keeps the VND catalog price', async () => {
    const { service, createWithTransaction } = harness();
    await service.create(dto() as never, customer as never);
    const saved = createWithTransaction.mock.calls[0][1] as Record<string, { toFixed?: (n: number) => string } | string>;
    expect(saved.catalogCurrency).toBe('VND');
    expect((saved.catalogAmount as { toFixed(n: number): string }).toFixed(0)).toBe('100000');
    expect(saved.chargeCurrency).toBe('USD');
    expect((saved.chargeAmount as { toFixed(n: number): string }).toFixed(2)).toBe('4.00');
    expect(saved.costCurrency).toBe('USD');
    expect((saved.costAmount as { toFixed(n: number): string }).toFixed(1)).toBe('3.5');
    expect(saved.fxRateId).toBe('fx-1');
    expect(saved.fxAsOf).toBeInstanceOf(Date);
    expect((saved.totalAmount as { toFixed(n: number): string }).toFixed(0)).toBe('100000');
    expect(saved.esimMarket).toBe('INTL');
    expect(saved.pricingLockedAt).toBeInstanceOf(Date);
  });

  it('rounds the USD charge half up to 2 decimals', async () => {
    const { service, createWithTransaction } = harness({ sell: '100125' });
    await service.create(dto() as never, customer as never);
    const saved = createWithTransaction.mock.calls[0][1] as { chargeAmount: { toFixed(n: number): string } };
    expect(saved.chargeAmount.toFixed(2)).toBe('4.01');
  });

  it('refuses an international order when no rate is effective, the rate is stale, or cost is missing', async () => {
    const missing = harness({ fx: [] });
    await expect(missing.service.create(dto() as never, customer as never)).rejects.toThrow('FX_MISSING');
    expect(missing.createWithTransaction).not.toHaveBeenCalled();

    const stale = harness({
      fx: [fxRow({
        observedAt: new Date(Date.now() - 10 * 86_400_000),
        effectiveFrom: new Date(Date.now() - 10 * 86_400_000),
      })],
    });
    await expect(stale.service.create(dto() as never, customer as never)).rejects.toThrow('FX_EXPIRED');

    const republished = harness({
      fx: [fxRow({ observedAt: new Date(Date.now() - 10 * 86_400_000), effectiveFrom: new Date() })],
    });
    await expect(republished.service.create(dto() as never, customer as never)).resolves.toMatchObject({ id: 'order-new' });

    const noCost = harness({ costAmount: '0' });
    await expect(noCost.service.create(dto() as never, customer as never)).rejects.toThrow('INVALID_COST');
  });

  it('ignores a client amount and FX rate', async () => {
    const { service, createWithTransaction } = harness();
    await service.create(dto({ amount: '1.00', fxRate: '1', chargeAmount: '9.99' }) as never, customer as never);
    const saved = createWithTransaction.mock.calls[0][1] as { chargeAmount: { toFixed(n: number): string }; fxRateId: string };
    expect(saved.chargeAmount.toFixed(2)).toBe('4.00');
    expect(saved.fxRateId).toBe('fx-1');
  });

  it('reuses the locked snapshot after the published rate changes', async () => {
    const { service, createWithTransaction, store } = harness();
    const first = await service.create(dto() as never, customer as never);
    store.current = {
      ...(store.current ?? {}),
      fxRateValue: new Decimal('25000'),
    };
    const rates = [fxRow({ id: 'fx-2', rate: new Decimal('30000') })];
    const again = harness({ fx: rates });
    again.store.current = store.current;
    const retry = await again.service.create(dto() as never, customer as never);
    expect(first.id).toBe('order-new');
    expect(retry.id).toBe('order-new');
    expect(createWithTransaction).toHaveBeenCalledTimes(1);
    expect(again.createWithTransaction).not.toHaveBeenCalled();
  });

  it('keeps a Vietnam package on a VND snapshot and does not read FX', async () => {
    const { service, createWithTransaction, fxReads } = harness({ countryIso: 'VN', gateway: 'SEPAY' });
    await service.create(
      { items: [{ variantId: 'variant-1', quantity: 1 }], paymentMethodCode: 'SEPAY', market: 'VN' } as never,
      customer as never,
    );
    const saved = createWithTransaction.mock.calls[0][1] as { chargeCurrency: string; chargeAmount: { toFixed(n: number): string }; fxRateId: string | null };
    expect(saved.chargeCurrency).toBe('VND');
    expect(saved.chargeAmount.toFixed(0)).toBe('100000');
    expect(saved.fxRateId).toBeNull();
    expect(fxReads).toHaveLength(0);
  });

  it('rejects a client market that disagrees with the selected gateway', async () => {
    const { service } = harness({ countryIso: 'KR' });
    await expect(
      service.create(
        { items: [{ variantId: 'variant-1', quantity: 1 }], paymentMethodCode: 'PAYPAL', market: 'VN' } as never,
        customer as never,
      ),
    ).rejects.toThrow('does not match the payment method');
  });
});
