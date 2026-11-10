import {
  AuditTargetType,
  FulfillmentStatus,
  OrderPaymentStatus,
  UserStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { vietnamDayBounds } from '../../common/utils/vietnam-time.util';
import { AdminRepository } from './repositories/admin.repository';
import { AdminCustomerService } from './services/admin-customer.service';

describe('Wave 1 — Admin Customer Center', () => {
  it('listCustomers forwards Vietnam day bounds and returns repository envelope', async () => {
    const repository = {
      findCustomers: jest.fn().mockResolvedValue({
        items: [{ id: 'c1', email: 'a@test.com' }],
        total: 1,
        skip: 0,
        take: 25,
      }),
    };
    const service = new AdminCustomerService(
      repository as never,
      {} as never,
      { record: jest.fn() } as never,
      {} as never,
      {} as never,
      { get: jest.fn() } as never,
    );

    const result = await service.listCustomers({
      status: UserStatus.ACTIVE,
      createdFrom: '2026-11-01',
      createdTo: '2026-11-09',
      skip: 0,
      take: 25,
    });

    expect(result.total).toBe(1);
    const call = repository.findCustomers.mock.calls[0][0];
    expect(call.createdFrom).toEqual(vietnamDayBounds('2026-11-01').start);
    expect(call.createdToExclusive).toEqual(vietnamDayBounds('2026-11-09').endExclusive);
    // Inclusive ICT day: 00:00+07 → next 00:00+07
    expect(call.createdFrom.toISOString()).toBe('2026-10-31T17:00:00.000Z');
    expect(call.createdToExclusive.toISOString()).toBe('2026-11-09T17:00:00.000Z');
  });

  it('createdFrom/createdTo single-day window is exactly one Vietnam calendar day', async () => {
    const repository = {
      findCustomers: jest.fn().mockResolvedValue({ items: [], total: 0, skip: 0, take: 25 }),
    };
    const service = new AdminCustomerService(
      repository as never,
      {} as never,
      { record: jest.fn() } as never,
      {} as never,
      {} as never,
      { get: jest.fn() } as never,
    );

    await service.listCustomers({
      createdFrom: '2026-11-09',
      createdTo: '2026-11-09',
    });

    const call = repository.findCustomers.mock.calls[0][0];
    expect(call.createdToExclusive.getTime() - call.createdFrom.getTime()).toBe(
      24 * 60 * 60 * 1000,
    );
    expect(call.createdFrom.toISOString()).toBe('2026-11-08T17:00:00.000Z');
    expect(call.createdToExclusive.toISOString()).toBe('2026-11-09T17:00:00.000Z');
  });

  it('getCustomer maps KPIs with REFUNDED separated and keeps totalSpending alias', async () => {
    const repository = {
      findCustomerById: jest.fn().mockResolvedValue({
        id: 'c1',
        email: 'a@test.com',
        username: 'a',
        fullName: 'A',
        phone: null,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date('2026-01-01'),
        acceptedTermsAt: new Date('2026-01-01'),
        lastLoginAt: new Date('2026-11-01'),
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-11-01'),
        orders: [
          {
            id: 'o1',
            orderCode: 'ORD-1',
            totalAmount: new Decimal('100000'),
            paymentStatus: 'PAID',
            fulfillmentStatus: 'COMPLETED',
            createdAt: new Date('2026-11-01'),
            orderItems: [
              {
                quantity: 2,
                variant: { name: '100k', product: { name: 'Viettel' } },
              },
            ],
          },
        ],
        _count: { orders: 1 },
      }),
      aggregateCustomerOrderKpis: jest.fn().mockResolvedValue({
        totalOrders: 5,
        successfulOrders: 2,
        failedOrCancelledOrders: 1,
        refundedOrders: 1,
        totalPaidAmount: new Decimal('100000.00'),
      }),
      findCustomerLoginAuditEvents: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'a1',
            action: 'LOGIN_SUCCESS',
            ipAddress: '1.2.3.4',
            createdAt: new Date('2026-11-01'),
            metadata: {},
          },
        ],
        total: 1,
        skip: 0,
        take: 10,
      }),
    };

    const service = new AdminCustomerService(
      repository as never,
      {} as never,
      { record: jest.fn() } as never,
      {} as never,
      {} as never,
      { get: jest.fn() } as never,
    );

    const detail = await service.getCustomer('c1', { orderSkip: 0, orderTake: 10 });

    expect(detail.kpis).toEqual({
      totalOrders: 5,
      successfulOrders: 2,
      failedOrCancelledOrders: 1,
      refundedOrders: 1,
      totalPaidAmount: '100000.00',
    });
    expect(detail.totalSpending).toBe('100000.00');
    expect(detail.orders[0].productSummary).toBe('Viettel · 100k ×2');
    expect(detail.loginEvents.source).toBe('audit_logs');
    expect(detail.loginEvents.items[0].ipAddress).toBe('1.2.3.4');
    expect(repository.findCustomerLoginAuditEvents).toHaveBeenCalledWith('c1', 0, 10);
  });

  it('returns empty loginEvents list when audit has no rows', async () => {
    const repository = {
      findCustomerById: jest.fn().mockResolvedValue({
        id: 'c1',
        email: 'a@test.com',
        username: null,
        fullName: null,
        phone: null,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: null,
        acceptedTermsAt: null,
        lastLoginAt: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        orders: [],
        _count: { orders: 0 },
      }),
      aggregateCustomerOrderKpis: jest.fn().mockResolvedValue({
        totalOrders: 0,
        successfulOrders: 0,
        failedOrCancelledOrders: 0,
        refundedOrders: 0,
        totalPaidAmount: new Decimal(0),
      }),
      findCustomerLoginAuditEvents: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        skip: 0,
        take: 10,
      }),
    };

    const service = new AdminCustomerService(
      repository as never,
      {} as never,
      { record: jest.fn() } as never,
      {} as never,
      {} as never,
      { get: jest.fn() } as never,
    );

    const detail = await service.getCustomer('c1');
    expect(detail.loginEvents.items).toEqual([]);
    expect(detail.loginEvents.total).toBe(0);
  });

  it('locks customer and writes admin audit', async () => {
    const repository = {
      findCustomerById: jest.fn().mockResolvedValue({ id: 'c1', email: 'c@test.com', orders: [] }),
    };
    const prisma = {
      user: {
        update: jest
          .fn()
          .mockResolvedValue({ id: 'c1', email: 'c@test.com', status: UserStatus.SUSPENDED }),
      },
    };
    const adminAudit = { record: jest.fn() };
    const service = new AdminCustomerService(
      repository as never,
      prisma as never,
      adminAudit as never,
      {} as never,
      {} as never,
      { get: jest.fn() } as never,
    );

    const result = await service.lockCustomer('admin-1', 'c1');
    expect(result.status).toBe(UserStatus.SUSPENDED);
    expect(adminAudit.record).toHaveBeenCalled();
  });
});

describe('Wave 1 — Customer KPI / login audit repository filters', () => {
  function makeRepo(prisma: {
    order: { count: jest.Mock; aggregate: jest.Mock };
    auditLog?: { findMany: jest.Mock; count: jest.Mock };
  }) {
    return new AdminRepository(prisma as never);
  }

  it('aggregateCustomerOrderKpis excludes REFUNDED from failed and counts refunded separately', async () => {
    const order = {
      count: jest
        .fn()
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(4) // successful
        .mockResolvedValueOnce(2) // failed
        .mockResolvedValueOnce(3), // refunded
      aggregate: jest.fn().mockResolvedValue({ _sum: { totalAmount: new Decimal('500000') } }),
    };
    const repo = makeRepo({ order });
    const kpis = await repo.aggregateCustomerOrderKpis('cust-1');

    expect(kpis.failedOrCancelledOrders).toBe(2);
    expect(kpis.refundedOrders).toBe(3);
    expect(kpis.totalPaidAmount.toFixed(2)).toBe('500000.00');

    const failedWhere = order.count.mock.calls[2][0].where;
    expect(failedWhere.NOT).toEqual({ paymentStatus: OrderPaymentStatus.REFUNDED });
    expect(failedWhere.OR).toEqual(
      expect.arrayContaining([
        {
          paymentStatus: {
            in: [OrderPaymentStatus.FAILED, OrderPaymentStatus.EXPIRED],
          },
        },
        { fulfillmentStatus: FulfillmentStatus.FAILED },
      ]),
    );

    const refundedWhere = order.count.mock.calls[3][0].where;
    expect(refundedWhere.paymentStatus).toBe(OrderPaymentStatus.REFUNDED);
    // Four order.count calls = distinct Order aggregates, never payment table
    expect(order.count).toHaveBeenCalledTimes(4);
  });

  it('findCustomerLoginAuditEvents scopes to customer self-actor LOGIN_* only', async () => {
    const auditLog = {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    };
    const repo = makeRepo({
      order: { count: jest.fn(), aggregate: jest.fn() },
      auditLog,
    });

    const result = await repo.findCustomerLoginAuditEvents('cust-uuid', 0, 10);
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);

    expect(auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          targetType: AuditTargetType.USER,
          targetId: 'cust-uuid',
          adminId: 'cust-uuid',
          action: { in: ['LOGIN_SUCCESS', 'LOGIN_FAILED'] },
        },
      }),
    );
  });
});
