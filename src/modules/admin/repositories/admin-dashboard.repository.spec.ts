import {
  AgentStatus,
  FulfillmentStatus,
  OrderChannel,
  OrderPaymentStatus,
  PaymentRecordStatus,
  ProductVariantType,
  ProviderTransactionStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { AdminRepository } from './admin.repository';

function createPrismaMock() {
  return {
    order: {
      aggregate: jest.fn(),
      count: jest.fn(),
    },
    payment: {
      count: jest.fn(),
    },
    providerLog: {
      count: jest.fn(),
    },
    agent: {
      groupBy: jest.fn(),
    },
  };
}

describe('AdminRepository.getDashboardStats (Operations Cockpit C1)', () => {
  const fixedNow = new Date('2026-03-15T03:00:00.000Z'); // 10:00 ICT

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(fixedNow);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function setupCounts(prisma: ReturnType<typeof createPrismaMock>) {
    prisma.order.aggregate.mockResolvedValue({
      _sum: {
        sellAmount: new Decimal('100000.00'),
        providerCost: new Decimal('70000.00'),
        paymentFeeAmount: new Decimal('1500.00'),
      },
    });
    // paid, created, pending, processing, waitingAdminRetry, needManualReview
    prisma.order.count
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(9)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(3);
    prisma.payment.count.mockResolvedValueOnce(5).mockResolvedValueOnce(2);
    prisma.providerLog.count.mockResolvedValue(7);
    prisma.agent.groupBy.mockResolvedValue([
      { status: AgentStatus.ACTIVE, _count: { id: 3 } },
      { status: AgentStatus.PENDING_KYC, _count: { id: 1 } },
      { status: AgentStatus.SUSPENDED, _count: { id: 0 } },
      { status: AgentStatus.REJECTED, _count: { id: 1 } },
    ]);
  }

  it('aggregates business / payment / backlog / provider / agent without findMany', async () => {
    const prisma = createPrismaMock();
    setupCounts(prisma);
    const repo = new AdminRepository(prisma as never);

    const result = await repo.getDashboardStats('today');

    expect(prisma.order.aggregate).toHaveBeenCalledTimes(1);
    expect(prisma.order.count).toHaveBeenCalledTimes(6);
    expect(prisma.payment.count).toHaveBeenCalledTimes(2);
    expect(prisma.providerLog.count).toHaveBeenCalledTimes(1);
    expect((prisma as { order: { findMany?: unknown } }).order.findMany).toBeUndefined();

    expect(result.period).toEqual({
      preset: 'today',
      dateFrom: '2026-03-15',
      dateTo: '2026-03-15',
      timezone: 'Asia/Ho_Chi_Minh',
    });
    expect(result.currency).toBe('VND');
    expect(result.business).toEqual({
      revenue: '100000.00',
      profit: '28500.00',
      providerCost: '70000.00',
      gatewayFee: '1500.00',
      paidOrderCount: 4,
      createdOrderCount: 9,
    });
    expect(result.payments).toEqual({
      successAttemptCount: 5,
      failedAttemptCount: 2,
    });
    expect(result.backlog).toEqual({
      pendingDelivery: 2,
      processing: 1,
      waitingAdminRetry: 1,
      needManualReview: 3,
    });
    expect(result.providerErrors).toBe(7);
    expect(result.providerErrorsScope).toBe('SYSTEM');
    expect(result.agentStatistics).toEqual({
      total: 5,
      active: 3,
      pendingKyc: 1,
      suspended: 0,
      rejected: 1,
    });
    // Legacy fields for pre-C2 FE
    expect(result.todayRevenue).toBe('100000.00');
    expect(result.ordersCount).toBe(9);
    expect(result.successfulPayments).toBe(5);
    expect(result.failedPayments).toBe(2);
    expect(result.pendingFulfillment).toBe(4); // pending+processing+waiting (not review)
  });

  it('B1–B3: paid orders require SUCCESS paidAt in period (not createdAt alone)', async () => {
    const prisma = createPrismaMock();
    setupCounts(prisma);
    const repo = new AdminRepository(prisma as never);
    await repo.getDashboardStats('today');

    const paidWhere = prisma.order.aggregate.mock.calls[0][0].where;
    expect(paidWhere.paymentStatus).toBe(OrderPaymentStatus.PAID);
    expect(paidWhere.channel).toBe(OrderChannel.B2C);
    expect(paidWhere.payments.some.status).toBe(PaymentRecordStatus.SUCCESS);
    expect(paidWhere.payments.some.paidAt).toEqual({
      gte: new Date('2026-03-14T17:00:00.000Z'),
      lt: new Date('2026-03-15T17:00:00.000Z'),
    });
    expect(paidWhere.NOT.orderItems.some.variant.type).toBe(ProductVariantType.ESIM);

    const createdWhere = prisma.order.count.mock.calls[1][0].where;
    expect(createdWhere.createdAt).toEqual({
      gte: new Date('2026-03-14T17:00:00.000Z'),
      lt: new Date('2026-03-15T17:00:00.000Z'),
    });
    expect(createdWhere.paymentStatus).toBeUndefined();
  });

  it('profit formula matches Orders Summary: sellAmount − providerCost − paymentFeeAmount', async () => {
    const prisma = createPrismaMock();
    setupCounts(prisma);
    prisma.order.aggregate.mockResolvedValue({
      _sum: {
        sellAmount: new Decimal('50000.00'),
        providerCost: new Decimal('30000.00'),
        paymentFeeAmount: new Decimal('500.00'),
      },
    });
    const repo = new AdminRepository(prisma as never);
    const result = await repo.getDashboardStats('today');
    expect(result.business.revenue).toBe('50000.00');
    expect(result.business.providerCost).toBe('30000.00');
    expect(result.business.gatewayFee).toBe('500.00');
    expect(result.business.profit).toBe('19500.00');
  });

  it('B5 uses paidAt; D1 uses updatedAt; both scope via retail order', async () => {
    const prisma = createPrismaMock();
    setupCounts(prisma);
    const repo = new AdminRepository(prisma as never);
    await repo.getDashboardStats('last7');

    const successWhere = prisma.payment.count.mock.calls[0][0].where;
    expect(successWhere.status).toBe(PaymentRecordStatus.SUCCESS);
    expect(successWhere.paidAt).toEqual({
      gte: new Date('2026-03-08T17:00:00.000Z'),
      lt: new Date('2026-03-15T17:00:00.000Z'),
    });
    expect(successWhere.order.channel).toBe(OrderChannel.B2C);
    expect(successWhere.order.NOT.orderItems.some.variant.type).toBe(ProductVariantType.ESIM);
    expect(successWhere.order.OR).toBeDefined(); // admin-test exclusion

    const failedWhere = prisma.payment.count.mock.calls[1][0].where;
    expect(failedWhere.status).toBe(PaymentRecordStatus.FAILED);
    expect(failedWhere.updatedAt).toEqual({
      gte: new Date('2026-03-08T17:00:00.000Z'),
      lt: new Date('2026-03-15T17:00:00.000Z'),
    });
    expect(failedWhere.paidAt).toBeUndefined();
    expect(failedWhere.order.channel).toBe(OrderChannel.B2C);
  });

  it('D2 counts provider_logs FAILED system-wide (no order join filter)', async () => {
    const prisma = createPrismaMock();
    setupCounts(prisma);
    const repo = new AdminRepository(prisma as never);
    await repo.getDashboardStats('today');

    const providerWhere = prisma.providerLog.count.mock.calls[0][0].where;
    expect(providerWhere).toEqual({
      createdAt: {
        gte: new Date('2026-03-14T17:00:00.000Z'),
        lt: new Date('2026-03-15T17:00:00.000Z'),
      },
      status: ProviderTransactionStatus.FAILED,
    });
    expect(providerWhere.order).toBeUndefined();
    expect(providerWhere.orderId).toBeUndefined();
  });

  it('backlog is PAID snapshot only, split by fulfillment status', async () => {
    const prisma = createPrismaMock();
    setupCounts(prisma);
    const repo = new AdminRepository(prisma as never);
    await repo.getDashboardStats('month');

    const backlogCalls = prisma.order.count.mock.calls.slice(2, 6);
    const statuses = backlogCalls.map((call) => call[0].where.fulfillmentStatus);
    expect(statuses).toEqual([
      FulfillmentStatus.PENDING,
      FulfillmentStatus.PROCESSING,
      FulfillmentStatus.WAITING_ADMIN_RETRY,
      FulfillmentStatus.NEED_MANUAL_REVIEW,
    ]);
    for (const call of backlogCalls) {
      expect(call[0].where.paymentStatus).toBe(OrderPaymentStatus.PAID);
      expect(call[0].where.channel).toBe(OrderChannel.B2C);
      expect(call[0].where.createdAt).toBeUndefined();
      expect(call[0].where.payments).toBeUndefined();
    }
  });

  it('agent statistics ignore period filter', async () => {
    const prisma = createPrismaMock();
    setupCounts(prisma);
    const repo = new AdminRepository(prisma as never);
    await repo.getDashboardStats('month');

    expect(prisma.agent.groupBy).toHaveBeenCalledWith({
      by: ['status'],
      where: { deletedAt: null },
      _count: { id: true },
    });
  });

  it('invalid period falls back to today', async () => {
    const prisma = createPrismaMock();
    setupCounts(prisma);
    const repo = new AdminRepository(prisma as never);
    const result = await repo.getDashboardStats('not-a-period');
    expect(result.period.preset).toBe('today');
  });
});
