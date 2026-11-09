import { Decimal } from '@prisma/client/runtime/library';
import { FinanceRepository } from './repositories/finance.repository';
import { AdminRepository } from '../admin/repositories/admin.repository';
import { EXCLUDE_ADMIN_TEST_ORDERS } from '../order/entities/commercial-order.where';

const dateFrom = new Date('2026-11-01T00:00:00.000Z');
const dateTo = new Date('2026-11-05T00:00:00.000Z');

function whereOf(mock: { mock: { calls: unknown[] } }, index = 0) {
  const call = mock.mock.calls[index] as [{ where: Record<string, unknown> }];
  return call[0].where;
}

function pricedOrder(clientTrace: unknown, total = '100000') {
  return {
    clientTrace,
    totalAmount: new Decimal(total),
    customerPaid: new Decimal(total),
    sellAmount: new Decimal(total),
    paymentFeeAmount: new Decimal(0),
    paymentFeePercent: new Decimal(0),
    paymentFeeFixed: new Decimal(0),
    paymentGateway: 'SEPAY',
    paymentMethodCode: 'VIETQR',
    methodDisplayName: 'VietQR',
    settlementType: 'BANK_TRANSFER',
    orderItems: [
      {
        quantity: 1,
        variant: {
          providerMappings: [{ providerId: 'airalo', providerCost: new Decimal('80000') }],
        },
      },
    ],
  };
}

describe('commercial totals exclude boolean adminTest orders', () => {
  const customer = pricedOrder({ customerId: 'user-1' }, '100000');
  const adminTest = pricedOrder({ adminTest: true, catalogSellAmountVnd: '103000' }, '103000');
  const stringMarker = pricedOrder({ adminTest: 'true' }, '50000');
  const rows = [customer, adminTest, stringMarker];

  function repository() {
    const prisma = {
      order: {
        findMany: jest.fn(async () => rows),
        aggregate: jest.fn(async () => ({ _sum: { paymentFeeAmount: new Decimal(0), totalAmount: new Decimal(0) } })),
        count: jest.fn(async () => 2),
        update: jest.fn(),
      },
      payment: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
      paymentGatewayInvoice: { findMany: jest.fn(async () => []) },
      orderItem: { findMany: jest.fn(async () => []) },
    };
    return { repo: new FinanceRepository(prisma as never), prisma };
  }

  it('counts customer revenue and profit, and keeps a string marker, without writing orders', async () => {
    const before = JSON.stringify(rows);
    const { repo, prisma } = repository();
    const profit = await repo.calculateProfit({ dateFrom, dateTo });
    expect(profit.orderCount).toBe(2);
    expect(profit.revenue).toBe('150000.00');
    expect(profit.providerCost).toBe('160000.00');
    expect(profit.grossProfit).toBe('-10000.00');
    expect(whereOf(prisma.order.findMany)).toEqual(
      expect.objectContaining(EXCLUDE_ADMIN_TEST_ORDERS),
    );
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(JSON.stringify(rows)).toBe(before);
    expect(adminTest.totalAmount.toFixed(0)).toBe('103000');
    expect(adminTest.clientTrace).toEqual({ adminTest: true, catalogSellAmountVnd: '103000' });
  });

  it('leaves payment-method totals on customer orders only', async () => {
    const { repo } = repository();
    const fees = await repo.calculateGatewayFees({ dateFrom, dateTo });
    expect(fees.rows).toHaveLength(1);
    expect(fees.rows[0].gateway).toBe('SEPAY');
    expect(fees.rows[0].methodCode).toBe('VIETQR');
    expect(fees.rows[0].transactionCount).toBe(2);
    expect(fees.rows[0].totalCollected).toBe('150000.00');
  });

  it('does not add an admin test into gateway settlement volume', async () => {
    const { repo } = repository();
    const settlement = await repo.calculatePaymentSettlement({ dateFrom, dateTo });
    expect(settlement.sections).toHaveLength(1);
    expect(settlement.sections[0].transactionCount).toBe(2);
    expect(settlement.sections[0].totalVolume).toBe('150000.00');
  });

  it('asks the database to drop boolean adminTest true without dropping missing keys', async () => {
    const { repo, prisma } = repository();
    await repo.sumGatewayFees(dateFrom, dateTo);
    await repo.findB2cCompletedOrderItemsForVat(dateFrom, dateTo);
    expect(whereOf(prisma.order.aggregate)).toEqual(
      expect.objectContaining(EXCLUDE_ADMIN_TEST_ORDERS),
    );
    expect(whereOf(prisma.orderItem.findMany).order).toEqual(
      expect.objectContaining(EXCLUDE_ADMIN_TEST_ORDERS),
    );
  });
});

describe('admin dashboard revenue skips boolean admin tests', () => {
  it('sums paid customer orders and ignores adminTest true', async () => {
    const paid = [
      { totalAmount: new Decimal('100000'), clientTrace: {} },
      { totalAmount: new Decimal('103000'), clientTrace: { adminTest: true } },
      { totalAmount: new Decimal('50000'), clientTrace: { adminTest: 'true' } },
    ];
    const prisma = {
      order: {
        count: jest.fn(async () => 2),
        findMany: jest.fn(async () => paid),
        aggregate: jest.fn(async () => ({ _sum: { sellAmount: new Decimal('150000'), providerCost: new Decimal(0), paymentFeeAmount: new Decimal(0) } })),
      },
      payment: { count: jest.fn(async () => 1) },
      providerLog: { count: jest.fn(async () => 0) },
      agent: { groupBy: jest.fn(async () => []) },
    };
    const repo = new AdminRepository(prisma as never);
    const stats = await repo.getDashboardStats();
    expect(stats.todayRevenue).toBe('150000.00');
    expect(stats.ordersCount).toBe(2);
    expect(whereOf(prisma.order.count)).toEqual(
      expect.objectContaining(EXCLUDE_ADMIN_TEST_ORDERS),
    );
    expect(whereOf(prisma.payment.count).order).toEqual(EXCLUDE_ADMIN_TEST_ORDERS);
    expect(paid[1].clientTrace).toEqual({ adminTest: true });
  });
});
