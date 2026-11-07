import { UserRole } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { AppHttpException } from '../../common/exceptions/app-http.exception';
import { ErrorCode } from '../../common/constants/error-codes.constants';
import { EsimOrderService } from './esim-order.service';
import { ESIM_ORDER_AMOUNT_LIMIT_MESSAGE } from './esim-charge-limit.rules';

function liveEnv(getKey: string) {
  return (
    {
      'esim.enabled': true,
      'esim.providerMode': 'live',
      'esim.liveArm': true,
    } as Record<string, boolean | string>
  )[getKey];
}

describe('esim-order charge limit enforce (Phase A)', () => {
  const superAdmin = {
    id: 'sa-limit',
    email: 'superadmin@cardon.vn',
    role: UserRole.SUPER_ADMIN,
  };

  function harness(
    system: Record<string, unknown>,
    gateway: 'SEPAY' | 'PAYPAL',
    options?: { findUser?: jest.Mock; salesOpen?: boolean },
  ) {
    const createFinancialTransaction = jest.fn().mockResolvedValue({ id: 'fin-1' });
    const findUser =
      options?.findUser ??
      jest.fn().mockResolvedValue({ createdAt: new Date(Date.now() - 100 * 3_600_000) });
    const created: { current: Record<string, unknown> | null } = { current: null };
    const createWithTransaction = jest.fn().mockImplementation(async (_tx: unknown, data: Record<string, unknown>) => {
      created.current = {
        id: 'order-ok',
        orderCode: 'CO-OK',
        channel: 'B2C',
        isGuestOrder: false,
        guestEmail: superAdmin.email,
        guestPhone: null,
        invoiceRequired: false,
        invoiceMetadata: {},
        customerNote: null,
        discountAmount: new Decimal(0),
        paymentStatus: 'WAITING_PAYMENT',
        fulfillmentStatus: 'PENDING',
        createdAt: new Date(),
        orderItems: [
          {
            id: 'item-1',
            variantId: 'variant-1',
            quantity: 1,
            variant: { sku: 'KR', name: '1GB' },
          },
        ],
        paymentFeePercent: new Decimal(0),
        paymentFeeFixed: new Decimal(0),
        paymentFeeAmount: new Decimal(0),
        profit: new Decimal(10000),
        faceValue: new Decimal(100000),
        ...data,
      };
      return created.current;
    });
    const createOrderItem = jest.fn().mockResolvedValue({ id: 'item-1' });
    const salesOpen = options?.salesOpen === true;
    const service = new EsimOrderService(
      {
        $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            $executeRaw: async () => 1,
            esimOrderQuote: { create: jest.fn().mockResolvedValue({}) },
            order: {
              findMany: async () => [],
              findFirst: async () => created.current,
            },
          }),
        user: { findUnique: findUser },
        providerProductMapping: {
          findFirst: async () => ({
            provider: { id: 'airalo-1' },
            providerProductCode: 'pkg-1',
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
        resolveSystemConfig: () => ({
          customerEsimEnabled: salesOpen,
          ...system,
        }),
        getPublicPaymentMethods: () => [],
        resolvePaymentMethod: () =>
          gateway === 'PAYPAL'
            ? {
                methodCode: 'PAYPAL',
                displayName: 'PayPal',
                gatewayCode: 'PAYPAL',
                settlementType: 'GATEWAY_SETTLEMENT',
                percentageFee: 0,
                fixedFee: 0,
              }
            : {
                methodCode: 'SEPAY',
                displayName: 'SePay',
                gatewayCode: 'SEPAY',
                settlementType: 'BANK_TRANSFER',
                percentageFee: 0,
                fixedFee: 0,
              },
        resolvePaypalConfig: () => ({
          esimEnabled: true,
          mode: 'sandbox',
          clientId: 'client',
          clientSecret: 'secret',
          webhookId: 'wh',
        }),
      } as never,
      { get: liveEnv } as never,
    );
    return { service, createFinancialTransaction, createWithTransaction, findUser };
  }

  it('blocks SePay VND admin-test when charge exceeds configured limit', async () => {
    const { service, createFinancialTransaction, createWithTransaction } = harness(
      { esimMaxChargeAmountVnd: 50_000 },
      'SEPAY',
    );
    await expect(
      service.createAdminTest(
        {
          items: [{ variantId: 'variant-1', quantity: 1 }],
          paymentMethodCode: 'SEPAY',
          market: 'VN',
        } as never,
        superAdmin as never,
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.ESIM_ORDER_AMOUNT_LIMIT,
      message: ESIM_ORDER_AMOUNT_LIMIT_MESSAGE,
    });
    expect(createFinancialTransaction).not.toHaveBeenCalled();
    expect(createWithTransaction).not.toHaveBeenCalled();
  });

  it('allows SePay VND at the inclusive boundary', async () => {
    const { service, createFinancialTransaction, createWithTransaction } = harness(
      { esimMaxChargeAmountVnd: 100_000 },
      'SEPAY',
    );
    await expect(
      service.createAdminTest(
        {
          items: [{ variantId: 'variant-1', quantity: 1 }],
          paymentMethodCode: 'SEPAY',
          market: 'VN',
        } as never,
        superAdmin as never,
      ),
    ).resolves.toBeTruthy();
    expect(createFinancialTransaction).toHaveBeenCalled();
    expect(createWithTransaction).toHaveBeenCalled();
  });

  it('blocks PayPal admin-test sandbox USD when above the effective admin limit', async () => {
    const { service, createFinancialTransaction, createWithTransaction } = harness(
      { esimMaxChargeAmountUsd: 5 },
      'PAYPAL',
    );
    let err: unknown;
    try {
      await service.createAdminTest(
        {
          items: [{ variantId: 'variant-1', quantity: 1 }],
          paymentMethodCode: 'PAYPAL',
          market: 'INTL',
        } as never,
        superAdmin as never,
        undefined,
        '10.00',
      );
    } catch (caught) {
      err = caught;
    }
    expect(err).toBeInstanceOf(AppHttpException);
    expect(err).toMatchObject({
      code: ErrorCode.ESIM_ORDER_AMOUNT_LIMIT,
      message: ESIM_ORDER_AMOUNT_LIMIT_MESSAGE,
    });
    expect(createFinancialTransaction).not.toHaveBeenCalled();
    expect(createWithTransaction).not.toHaveBeenCalled();
  });

  it('does not trust client-declared amounts — uses server charge snapshot for VND', async () => {
    const { service, createFinancialTransaction } = harness(
      { esimMaxChargeAmountVnd: 50_000 },
      'SEPAY',
    );
    await expect(
      service.createAdminTest(
        {
          items: [{ variantId: 'variant-1', quantity: 1 }],
          paymentMethodCode: 'SEPAY',
          market: 'VN',
          // Ignored by create path; present only to prove client fields do not bypass.
          totalAmount: 1,
          chargeAmount: 1,
        } as never,
        superAdmin as never,
      ),
    ).rejects.toMatchObject({ code: ErrorCode.ESIM_ORDER_AMOUNT_LIMIT });
    expect(createFinancialTransaction).not.toHaveBeenCalled();
  });

  it('C2: customer create loads createdAt from DB; missing user fails closed without inventing maturity', async () => {
    const findUser = jest.fn().mockResolvedValue(null);
    const { service, findUser: wired, createFinancialTransaction } = harness(
      { esimMaxChargeAmountVnd: 100_000 },
      'SEPAY',
      { findUser, salesOpen: true },
    );
    expect(wired).toBe(findUser);
    await expect(
      service.create(
        {
          items: [{ variantId: 'variant-1', quantity: 1 }],
          paymentMethodCode: 'SEPAY',
          market: 'VN',
        } as never,
        { id: 'cust-1', email: 'c@test.invalid', role: UserRole.CUSTOMER } as never,
      ),
    ).resolves.toBeTruthy();
    expect(findUser).toHaveBeenCalledWith({
      where: { id: 'cust-1' },
      select: { createdAt: true },
    });
    expect(createFinancialTransaction).toHaveBeenCalled();
  });

  it('C2: admin-test does not query user.createdAt for the new-account age rule', async () => {
    const findUser = jest.fn();
    const { service } = harness({ esimMaxChargeAmountVnd: 100_000 }, 'SEPAY', { findUser });
    await service.createAdminTest(
      {
        items: [{ variantId: 'variant-1', quantity: 1 }],
        paymentMethodCode: 'SEPAY',
        market: 'VN',
      } as never,
      superAdmin as never,
    );
    expect(findUser).not.toHaveBeenCalled();
  });
});
