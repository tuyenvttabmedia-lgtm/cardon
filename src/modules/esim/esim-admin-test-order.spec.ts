import { ForbiddenException, RequestMethod } from '@nestjs/common';
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
    expect(source).not.toContain('adminTest');
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
