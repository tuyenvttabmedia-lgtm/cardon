import { BadRequestException, ForbiddenException, RequestMethod, ValidationPipe } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { FulfillmentStatus, OrderPaymentStatus, UserRole } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { EsimOpsAdminController } from '../admin/controllers/esim-ops.controller';
import { AdminEsimTestOrderDto } from '../admin/dto/esim-ops.dto';
import { ADMIN_AUDIT_ACTIONS } from '../admin/entities/admin.constants';
import { EsimOrderService } from './esim-order.service';
import { EsimPublicCatalogService } from './esim-public-catalog.service';
import { OrderService } from '../order/services/order.service';

const root = join(__dirname, '../../..');

function liveEnv(getKey: string) {
  return (
    {
      'esim.enabled': true,
      'esim.providerMode': 'live',
      'esim.liveArm': true,
    } as Record<string, boolean | string>
  )[getKey];
}

const waitingOrder = {
  id: 'order-admin-test',
  orderCode: 'CO-ADMIN',
  channel: 'B2C',
  isGuestOrder: false,
  guestEmail: 'superadmin@cardon.vn',
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
  orderItems: [
    { id: 'item-1', variantId: 'variant-1', quantity: 1, variant: { sku: 'KR', name: '1GB' } },
  ],
};

function orderServiceHarness(settingsEnabled: boolean) {
  const store: { current: typeof waitingOrder | null } = { current: null };
  const createWithTransaction = jest.fn().mockImplementation(async () => {
    store.current = waitingOrder;
    return waitingOrder;
  });
  const createFinancialTransaction = jest.fn().mockResolvedValue({ id: 'fin-1' });
  const createOrderItem = jest.fn().mockResolvedValue({ id: 'item-1' });
  const quoteCreate = jest.fn().mockResolvedValue({});
  const service = new EsimOrderService(
    {
      $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          $executeRaw: async () => 1,
          esimOrderQuote: { create: quoteCreate },
          order: {
            findMany: async () => (store.current ? [store.current] : []),
            findFirst: async () => store.current,
          },
        }),
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
    { get: liveEnv } as never,
  );
  return { service, createWithTransaction, quoteCreate, store };
}

describe('admin-only eSIM test order', () => {
  const handler = EsimOpsAdminController.prototype.createTestOrder;

  it('exposes POST /admin/esim-ops/orders for SUPER_ADMIN only', () => {
    expect(Reflect.getMetadata(PATH_METADATA, EsimOpsAdminController)).toBe('admin/esim-ops');
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('orders');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual(['orders.manage']);
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([UserRole.SUPER_ADMIN]);
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual(
      expect.arrayContaining([RolesGuard]),
    );
  });

  it('rejects CUSTOMER, AGENT, and ADMIN through RolesGuard', () => {
    const guard = new RolesGuard({
      getAllAndOverride: jest.fn().mockReturnValue([UserRole.SUPER_ADMIN]),
    } as never);
    for (const role of [UserRole.CUSTOMER, UserRole.AGENT, UserRole.ADMIN]) {
      expect(() =>
        guard.canActivate({
          getHandler: () => handler,
          getClass: () => EsimOpsAdminController,
          switchToHttp: () => ({
            getRequest: () => ({ user: { id: 'u1', email: 'x@test.invalid', role } }),
          }),
        } as never),
      ).toThrow(ForbiddenException);
    }
  });

  it('allows SUPER_ADMIN through RolesGuard and permission check', async () => {
    const roles = new RolesGuard({
      getAllAndOverride: jest.fn().mockReturnValue([UserRole.SUPER_ADMIN]),
    } as never);
    expect(
      roles.canActivate({
        getHandler: () => handler,
        getClass: () => EsimOpsAdminController,
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: 'sa', email: 'sa@test.invalid', role: UserRole.SUPER_ADMIN },
          }),
        }),
      } as never),
    ).toBe(true);

    const permissions = new PermissionsGuard(
      { getAllAndOverride: jest.fn().mockReturnValue(['orders.manage']) } as never,
      { roleHasAnyPermission: jest.fn().mockResolvedValue(true) } as never,
    );
    await expect(
      permissions.canActivate({
        getHandler: () => handler,
        getClass: () => EsimOpsAdminController,
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: 'sa', email: 'sa@test.invalid', role: UserRole.SUPER_ADMIN },
          }),
        }),
      } as never),
    ).resolves.toBe(true);
  });

  it('keeps customer sales closed on public create and catalog', async () => {
    const { service, createWithTransaction } = orderServiceHarness(false);
    await expect(
      service.create(
        { items: [{ variantId: 'variant-1', quantity: 1 }] } as never,
        { id: 'cust-1', email: 'c@test.invalid', role: UserRole.CUSTOMER } as never,
      ),
    ).rejects.toThrow('eSIM sales are disabled');
    await expect(
      service.create(
        { items: [{ variantId: 'variant-1', quantity: 1 }] } as never,
        { id: 'admin-1', email: 'a@test.invalid', role: UserRole.ADMIN } as never,
      ),
    ).rejects.toThrow('eSIM sales are disabled');
    expect(createWithTransaction).not.toHaveBeenCalled();

    const catalog = new EsimPublicCatalogService(
      {} as never,
      { resolveSystemConfig: () => ({ customerEsimEnabled: false }) } as never,
      { get: liveEnv } as never,
    );
    expect(catalog.salesOpen()).toBe(false);
  });

  it('public OrderService never passes adminTest', () => {
    const source = readFileSync(join(root, 'src/modules/order/services/order.service.ts'), 'utf8');
    const customerDto = readFileSync(join(root, 'src/modules/order/dto/create-order.dto.ts'), 'utf8');
    expect(source).not.toContain('adminTest');
    expect(source).not.toContain('testAmountUsd');
    expect(customerDto).not.toContain('testAmountUsd');
    expect(source).toContain('this.esimOrders.create(dto, user, requestMeta)');
  });

  it('SUPER_ADMIN createAdminTest succeeds while sales are off and reuses on retry', async () => {
    const { service, createWithTransaction, quoteCreate } = orderServiceHarness(false);
    const superAdmin = {
      id: 'sa-1',
      email: 'superadmin@cardon.vn',
      role: UserRole.SUPER_ADMIN,
    };
    const dto = {
      items: [{ variantId: 'variant-1', quantity: 1 }],
      paymentMethodCode: 'SEPAY',
      market: 'VN',
    };

    const first = await service.createAdminTest(dto as never, superAdmin as never);
    const retry = await service.createAdminTest(dto as never, superAdmin as never);

    expect(first.id).toBe('order-admin-test');
    expect(retry.id).toBe(first.id);
    expect(createWithTransaction).toHaveBeenCalledTimes(1);
    expect(quoteCreate).toHaveBeenCalledTimes(1);
  });

  it('rejects createAdminTest for ADMIN and CUSTOMER', async () => {
    const { service, createWithTransaction } = orderServiceHarness(false);
    const dto = { items: [{ variantId: 'variant-1', quantity: 1 }] };
    await expect(
      service.createAdminTest(dto as never, {
        id: 'admin-1',
        email: 'a@test.invalid',
        role: UserRole.ADMIN,
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.createAdminTest(dto as never, {
        id: 'cust-1',
        email: 'c@test.invalid',
        role: UserRole.CUSTOMER,
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(createWithTransaction).not.toHaveBeenCalled();
  });

  it('controller records ADMIN_ESIM_TEST_ORDER_CREATED without calling providers', async () => {
    const createAdminTest = jest.fn().mockResolvedValue({
      id: 'order-admin-test',
      orderCode: 'CO-ADMIN',
    });
    const record = jest.fn();
    const controller = new EsimOpsAdminController(
      {} as never,
      {} as never,
      { createAdminTest } as never,
      { record } as never,
    );
    const result = await controller.createTestOrder(
      { id: 'sa-1', email: 'sa@test.invalid', role: UserRole.SUPER_ADMIN } as never,
      { variantId: 'variant-1', paymentMethodCode: 'SEPAY' },
      { headers: {}, ip: '127.0.0.1' } as never,
    );
    expect(result.orderCode).toBe('CO-ADMIN');
    expect(createAdminTest).toHaveBeenCalledWith(
      {
        items: [{ variantId: 'variant-1', quantity: 1 }],
        paymentMethodCode: 'SEPAY',
        market: 'VN',
      },
      expect.objectContaining({ role: UserRole.SUPER_ADMIN }),
      expect.any(Object),
      undefined,
    );
    expect(record).toHaveBeenCalledWith(
      'sa-1',
      ADMIN_AUDIT_ACTIONS.ADMIN_ESIM_TEST_ORDER_CREATED,
      expect.anything(),
      'order-admin-test',
      expect.objectContaining({ adminTest: true, variantId: 'variant-1' }),
      expect.anything(),
    );
  });

  it('does not route public OrderService eSIM creates through adminTest', async () => {
    const esimCreate = jest.fn().mockRejectedValue(new Error('eSIM sales are disabled'));
    const service = new OrderService(
      { systemSetting: { findUnique: jest.fn() } } as never,
      {
        createFinancialTransaction: jest.fn(),
        createWithTransaction: jest.fn(),
        createOrderItem: jest.fn(),
      } as never,
      {
        findActiveById: jest.fn().mockResolvedValue({ id: 'esim', type: 'ESIM' }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { create: esimCreate } as never,
    );
    await expect(
      service.createOrder(
        { items: [{ variantId: 'esim', quantity: 1 }] },
        { id: 'sa-1', email: 'sa@test.invalid', role: UserRole.SUPER_ADMIN } as never,
      ),
    ).rejects.toThrow('eSIM sales are disabled');
    expect(esimCreate).toHaveBeenCalledWith(
      { items: [{ variantId: 'esim', quantity: 1 }] },
      expect.objectContaining({ role: UserRole.SUPER_ADMIN }),
      undefined,
    );
  });
});

describe('PayPal sandbox admin-test charge', () => {
  const superAdmin = {
    id: 'sa-1',
    email: 'superadmin@cardon.vn',
    role: UserRole.SUPER_ADMIN,
  };

  function paypalHarness(mode: 'sandbox' | 'live' = 'sandbox') {
    const orders: Array<Record<string, unknown>> = [];
    const createWithTransaction = jest.fn().mockImplementation(async (_tx: unknown, data: Record<string, unknown>) => {
      const created = {
        ...waitingOrder,
        id: `order-${orders.length + 1}`,
        totalAmount: data.totalAmount,
        faceValue: data.faceValue,
        sellAmount: data.sellAmount,
        customerPaid: data.customerPaid,
        providerCost: data.providerCost,
        paymentGateway: data.paymentGateway,
        paymentMethodCode: data.paymentMethodCode,
        clientTrace: data.clientTrace,
        paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
        fulfillmentStatus: FulfillmentStatus.PENDING,
        paymentExpiresAt: data.paymentExpiresAt,
      };
      orders.push(created);
      return created;
    });
    const service = new EsimOrderService(
      {
        $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            $executeRaw: async () => 1,
            esimOrderQuote: { create: jest.fn().mockResolvedValue({}) },
            order: {
              findMany: async () => orders,
              findFirst: async () => orders[orders.length - 1] ?? null,
            },
          }),
        providerProductMapping: {
          findFirst: async () => ({
            provider: { id: 'airalo-1' },
            providerProductCode: 'failte-7days-1gb',
            providerCost: 90000,
          }),
        },
      } as never,
      {
        createFinancialTransaction: jest.fn().mockResolvedValue({ id: 'fin-1' }),
        createWithTransaction,
        createOrderItem: jest.fn().mockResolvedValue({ id: 'item-1' }),
      } as never,
      {
        findActiveById: async () => ({ id: 'variant-1', type: 'ESIM', faceValue: 103000 }),
      } as never,
      { getCustomerPrice: async () => '103000' } as never,
      { listForVariant: jest.fn() } as never,
      {
        resolveSystemConfig: () => ({ customerEsimEnabled: false }),
        getPublicPaymentMethods: () => [],
        resolvePaymentMethod: (code?: string) =>
          code === 'PAYPAL'
            ? {
                methodCode: 'PAYPAL',
                displayName: 'PayPal',
                gatewayCode: 'PAYPAL',
                settlementType: 'GATEWAY_SETTLEMENT',
                percentageFee: 0,
                fixedFee: 0,
              }
            : {
                methodCode: 'VIETQR',
                displayName: 'VietQR',
                gatewayCode: 'SEPAY',
                settlementType: 'BANK_TRANSFER',
                percentageFee: 0,
                fixedFee: 0,
              },
        resolvePaypalConfig: () => ({
          esimEnabled: true,
          mode,
          clientId: 'client',
          clientSecret: 'secret',
          webhookId: 'wh',
        }),
      } as never,
      { get: liveEnv } as never,
    );
    return { service, createWithTransaction, orders };
  }

  function paypalDto() {
    return {
      items: [{ variantId: 'variant-1', quantity: 1 }],
      paymentMethodCode: 'PAYPAL',
      market: 'INTL',
    };
  }

  function createPaypal(service: EsimOrderService, testAmountUsd?: string) {
    return service.createAdminTest(paypalDto() as never, superAdmin as never, undefined, testAmountUsd);
  }

  it('stores a 1.00 USD snapshot and keeps the 103000 VND catalog amounts', async () => {
    const { service, createWithTransaction } = paypalHarness();
    await createPaypal(service, '1.00');
    const saved = createWithTransaction.mock.calls[0][1] as {
      totalAmount: Decimal;
      sellAmount: Decimal;
      customerPaid: Decimal;
      providerCost: Decimal;
      catalogCurrency: string;
      catalogAmount: Decimal;
      chargeCurrency: string;
      chargeAmount: Decimal;
      esimMarket: string;
      clientTrace: {
        adminTest: boolean;
        adminTestCharge: Record<string, string>;
      };
    };
    expect(saved.totalAmount.toFixed(0)).toBe('103000');
    expect(saved.sellAmount.toFixed(0)).toBe('103000');
    expect(saved.customerPaid.toFixed(0)).toBe('103000');
    expect(saved.providerCost.toFixed(0)).toBe('90000');
    expect(saved.catalogCurrency).toBe('VND');
    expect(saved.catalogAmount.toFixed(0)).toBe('103000');
    expect(saved.chargeCurrency).toBe('VND');
    expect(saved.chargeAmount.toFixed(0)).toBe('103000');
    expect(saved.esimMarket).toBe('INTL');
    expect(saved.clientTrace.adminTest).toBe(true);
    expect(saved.clientTrace.adminTestCharge).toEqual({
      currency: 'USD',
      amount: '1.00',
      mode: 'sandbox',
      catalogCurrency: 'VND',
      catalogSellAmountVnd: '103000',
    });
  });

  it('defaults a blank PayPal amount to 1.00 and accepts 80.00', async () => {
    const blank = paypalHarness();
    await createPaypal(blank.service);
    expect(blank.createWithTransaction.mock.calls[0][1].clientTrace.adminTestCharge.amount).toBe('1.00');

    const max = paypalHarness();
    await createPaypal(max.service, '80.00');
    expect(max.createWithTransaction.mock.calls[0][1].clientTrace.adminTestCharge.amount).toBe('80.00');
  });

  it.each(['80.01', '0', '-1', '1.001', 'NaN', 'Infinity'])(
    'rejects PayPal amount %s before creating an order',
    async (amount) => {
      const { service, createWithTransaction } = paypalHarness();
      await expect(
        createPaypal(service, amount),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(createWithTransaction).not.toHaveBeenCalled();
    },
  );

  it('rejects LIVE mode before any order write', async () => {
    const { service, createWithTransaction } = paypalHarness('live');
    await expect(
      createPaypal(service, '1.00'),
    ).rejects.toThrow('Admin test PayPal requires sandbox mode');
    expect(createWithTransaction).not.toHaveBeenCalled();
  });

  it('does not reuse a waiting VietQR order or a skipped admin test', async () => {
    const viet = paypalHarness();
    viet.orders.push({
      ...waitingOrder,
      paymentGateway: 'SEPAY',
      paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
      fulfillmentStatus: FulfillmentStatus.PENDING,
      paymentExpiresAt: new Date(Date.now() + 10 * 60_000),
      clientTrace: { adminTest: true },
      orderItems: waitingOrder.orderItems,
    });
    await createPaypal(viet.service, '1.00');
    expect(viet.createWithTransaction).toHaveBeenCalledTimes(1);

    const skipped = paypalHarness();
    const skippedTrace = {
      adminTest: true,
      adminTestCharge: {
        currency: 'USD',
        amount: '1.00',
        mode: 'sandbox',
        catalogCurrency: 'VND',
        catalogSellAmountVnd: '103000',
      },
      adminTestFulfillment: { status: 'SKIPPED', reason: 'ADMIN_TEST' },
    };
    skipped.orders.push({
      ...waitingOrder,
      paymentGateway: 'PAYPAL',
      paymentStatus: OrderPaymentStatus.PAID,
      fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW,
      clientTrace: skippedTrace,
      orderItems: waitingOrder.orderItems,
    });
    await createPaypal(skipped.service, '1.00');
    expect(skipped.createWithTransaction).toHaveBeenCalledTimes(1);
    expect(skippedTrace.adminTestCharge.amount).toBe('1.00');
  });

  it('reuses the same waiting PayPal charge and does not rewrite it for a different amount', async () => {
    const { service, createWithTransaction, orders } = paypalHarness();
    const trace = {
      adminTest: true,
      adminTestCharge: {
        currency: 'USD',
        amount: '1.00',
        mode: 'sandbox',
        catalogCurrency: 'VND',
        catalogSellAmountVnd: '103000',
      },
    };
    orders.push({
      ...waitingOrder,
      paymentGateway: 'PAYPAL',
      paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
      fulfillmentStatus: FulfillmentStatus.PENDING,
      paymentExpiresAt: new Date(Date.now() + 10 * 60_000),
      clientTrace: trace,
      orderItems: waitingOrder.orderItems,
    });
    const reused = await createPaypal(service, '1.00');
    expect(reused.id).toBe('order-admin-test');
    expect(createWithTransaction).not.toHaveBeenCalled();

    await createPaypal(service, '5.00');
    expect(createWithTransaction).toHaveBeenCalledTimes(1);
    expect(trace.adminTestCharge.amount).toBe('1.00');
    expect(createWithTransaction.mock.calls[0][1].clientTrace.adminTestCharge.amount).toBe('5.00');
  });

  it('rejects adminTest on the request body', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    });
    await expect(
      pipe.transform(
        {
          variantId: '11111111-1111-4111-8111-111111111111',
          paymentMethodCode: 'PAYPAL',
          market: 'INTL',
          adminTest: true,
        },
        { type: 'body', metatype: AdminEsimTestOrderDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
