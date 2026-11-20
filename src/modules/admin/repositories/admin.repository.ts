import { Injectable } from '@nestjs/common';
import {
  AgentStatus,
  AuditTargetType,
  FulfillmentStatus,
  OrderPaymentStatus,
  PaymentGatewayCode,
  PaymentRecordStatus,
  Prisma,
  ProviderTransactionStatus,
  UserStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  vietnamCalendarDate,
  vietnamDayBounds,
} from '../../../common/utils/vietnam-time.util';
import { PrismaService } from '../../../database/prisma.service';
import { ACTIVE_ORDER_WHERE } from '../../order/entities/order.constants';
import { EXCLUDE_ADMIN_TEST_ORDERS } from '../../order/entities/commercial-order.where';
import { ACTIVE_PAYMENT_WHERE } from '../../payment/entities/payment.constants';
import { resolveAdminPagination } from '../utils/admin-pagination.util';
import { AdminOrderQueryDto } from '../dto/admin.dto';
import { buildAdminOrderWhere } from '../utils/admin-order-filter.util';
import {
  percentChange,
  resolveDashboardPeriodRange,
  resolvePreviousDashboardPeriodRange,
  type DashboardPeriodPreset,
} from '../entities/dashboard-period';
import { dashboardRetailOrderWhere } from '../entities/dashboard-retail-scope';
import {
  enumerateVietnamDates,
  resolveCustomerStatsPeriodRange,
} from '../entities/customer-stats-period';

const DASHBOARD_HOME_SERVICE_LABELS: Record<string, string> = {
  GAME_CARD: 'Thẻ game',
  PHONE_CARD: 'Thẻ điện thoại',
  TOPUP: 'Nạp tiền',
  DATA: 'Data / 3G-4G',
  ESIM: 'eSIM',
  OTHER: 'Khác',
};

type DashboardSeriesRow = {
  day: string;
  revenue: Decimal | string | number;
  profit: Decimal | string | number;
  paid_orders: bigint | number;
};

type DashboardBreakdownRow = {
  service: string | null;
  order_count: bigint | number;
  revenue: Decimal | string | number;
};

@Injectable()
export class AdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardStats(periodRaw?: string | null) {
    const range = resolveDashboardPeriodRange(periodRaw);
    const previousRange = resolvePreviousDashboardPeriodRange(range);
    const { fromInclusive, toExclusive } = range;
    const periodFilter = { gte: fromInclusive, lt: toExclusive };
    const previousFilter = {
      gte: previousRange.fromInclusive,
      lt: previousRange.toExclusive,
    };

    const retailPaidInPeriod: Prisma.OrderWhereInput = dashboardRetailOrderWhere({
      paymentStatus: OrderPaymentStatus.PAID,
      payments: {
        some: {
          ...ACTIVE_PAYMENT_WHERE,
          status: PaymentRecordStatus.SUCCESS,
          paidAt: periodFilter,
        },
      },
    });

    const retailPaidPrevious: Prisma.OrderWhereInput = dashboardRetailOrderWhere({
      paymentStatus: OrderPaymentStatus.PAID,
      payments: {
        some: {
          ...ACTIVE_PAYMENT_WHERE,
          status: PaymentRecordStatus.SUCCESS,
          paidAt: previousFilter,
        },
      },
    });

    const retailCreatedInPeriod: Prisma.OrderWhereInput = dashboardRetailOrderWhere({
      createdAt: periodFilter,
    });

    const retailPaymentOrderScope: Prisma.OrderWhereInput = dashboardRetailOrderWhere();

    const [
      businessAgg,
      paidOrderCount,
      createdOrderCount,
      successAttemptCount,
      failedAttemptCount,
      pendingDelivery,
      processing,
      waitingAdminRetry,
      needManualReview,
      providerErrors,
      agentStats,
      previousAgg,
      previousPaidOrderCount,
      seriesRows,
      breakdownRows,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: retailPaidInPeriod,
        _sum: {
          sellAmount: true,
          providerCost: true,
          paymentFeeAmount: true,
        },
      }),
      this.prisma.order.count({ where: retailPaidInPeriod }),
      this.prisma.order.count({ where: retailCreatedInPeriod }),
      this.prisma.payment.count({
        where: {
          ...ACTIVE_PAYMENT_WHERE,
          status: PaymentRecordStatus.SUCCESS,
          paidAt: periodFilter,
          order: retailPaymentOrderScope,
        },
      }),
      this.prisma.payment.count({
        where: {
          ...ACTIVE_PAYMENT_WHERE,
          status: PaymentRecordStatus.FAILED,
          updatedAt: periodFilter,
          order: retailPaymentOrderScope,
        },
      }),
      this.prisma.order.count({
        where: dashboardRetailOrderWhere({
          paymentStatus: OrderPaymentStatus.PAID,
          fulfillmentStatus: FulfillmentStatus.PENDING,
        }),
      }),
      this.prisma.order.count({
        where: dashboardRetailOrderWhere({
          paymentStatus: OrderPaymentStatus.PAID,
          fulfillmentStatus: FulfillmentStatus.PROCESSING,
        }),
      }),
      this.prisma.order.count({
        where: dashboardRetailOrderWhere({
          paymentStatus: OrderPaymentStatus.PAID,
          fulfillmentStatus: FulfillmentStatus.WAITING_ADMIN_RETRY,
        }),
      }),
      this.prisma.order.count({
        where: dashboardRetailOrderWhere({
          paymentStatus: OrderPaymentStatus.PAID,
          fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW,
        }),
      }),
      this.prisma.providerLog.count({
        where: {
          createdAt: periodFilter,
          status: ProviderTransactionStatus.FAILED,
        },
      }),
      this.prisma.agent.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: { id: true },
      }),
      this.prisma.order.aggregate({
        where: retailPaidPrevious,
        _sum: {
          sellAmount: true,
          providerCost: true,
          paymentFeeAmount: true,
        },
      }),
      this.prisma.order.count({ where: retailPaidPrevious }),
      this.queryDashboardSeries(fromInclusive, toExclusive),
      this.queryDashboardBreakdown(fromInclusive, toExclusive),
    ]);

    const revenue = businessAgg._sum.sellAmount ?? new Decimal(0);
    const providerCost = businessAgg._sum.providerCost ?? new Decimal(0);
    const gatewayFee = businessAgg._sum.paymentFeeAmount ?? new Decimal(0);
    const profit = revenue.sub(providerCost).sub(gatewayFee);
    const averageOrderValue =
      paidOrderCount > 0 ? revenue.div(paidOrderCount) : new Decimal(0);

    const previousRevenue = previousAgg._sum.sellAmount ?? new Decimal(0);
    const previousProviderCost = previousAgg._sum.providerCost ?? new Decimal(0);
    const previousGatewayFee = previousAgg._sum.paymentFeeAmount ?? new Decimal(0);
    const previousProfit = previousRevenue
      .sub(previousProviderCost)
      .sub(previousGatewayFee);
    const previousAverageOrderValue =
      previousPaidOrderCount > 0
        ? previousRevenue.div(previousPaidOrderCount)
        : new Decimal(0);

    const agentsByStatus = Object.fromEntries(
      agentStats.map((row) => [row.status, row._count.id]),
    );

    const agentStatistics = {
      total: agentStats.reduce((sum, row) => sum + row._count.id, 0),
      active: agentsByStatus[AgentStatus.ACTIVE] ?? 0,
      pendingKyc: agentsByStatus[AgentStatus.PENDING_KYC] ?? 0,
      suspended: agentsByStatus[AgentStatus.SUSPENDED] ?? 0,
      rejected: agentsByStatus[AgentStatus.REJECTED] ?? 0,
    };

    const backlog = {
      pendingDelivery,
      processing,
      waitingAdminRetry,
      needManualReview,
    };

    const seriesByDay = new Map(
      seriesRows.map((row) => [
        row.day,
        {
          revenue: new Decimal(row.revenue ?? 0).toFixed(2),
          profit: new Decimal(row.profit ?? 0).toFixed(2),
          paidOrders: Number(row.paid_orders ?? 0),
        },
      ]),
    );
    const series = enumerateVietnamDates(range.dateFrom, range.dateTo).map(
      (date) => ({
        date,
        revenue: seriesByDay.get(date)?.revenue ?? '0.00',
        profit: seriesByDay.get(date)?.profit ?? '0.00',
        paidOrders: seriesByDay.get(date)?.paidOrders ?? 0,
      }),
    );

    const totalBreakdownRevenue = breakdownRows.reduce(
      (sum, row) => sum.add(new Decimal(row.revenue ?? 0)),
      new Decimal(0),
    );
    const breakdown = breakdownRows.map((row) => {
      const serviceKey = (row.service ?? 'OTHER').toUpperCase();
      const service =
        serviceKey in DASHBOARD_HOME_SERVICE_LABELS ? serviceKey : 'OTHER';
      const rowRevenue = new Decimal(row.revenue ?? 0);
      const sharePercent =
        totalBreakdownRevenue.gt(0)
          ? Number(
              rowRevenue.div(totalBreakdownRevenue).mul(100).toFixed(1),
            )
          : 0;
      return {
        service,
        label: DASHBOARD_HOME_SERVICE_LABELS[service] ?? service,
        revenue: rowRevenue.toFixed(2),
        orderCount: Number(row.order_count ?? 0),
        sharePercent,
      };
    });

    return {
      period: {
        preset: range.preset satisfies DashboardPeriodPreset,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        timezone: range.timezone,
      },
      asOf: new Date().toISOString(),
      currency: 'VND' as const,
      business: {
        revenue: revenue.toFixed(2),
        profit: profit.toFixed(2),
        providerCost: providerCost.toFixed(2),
        gatewayFee: gatewayFee.toFixed(2),
        paidOrderCount,
        createdOrderCount,
        averageOrderValue: averageOrderValue.toFixed(2),
      },
      payments: {
        successAttemptCount,
        failedAttemptCount,
      },
      backlog,
      providerErrors,
      providerErrorsScope: 'SYSTEM' as const,
      agentStatistics,
      series,
      breakdown,
      compare: {
        revenuePercent: percentChange(
          Number(revenue.toFixed(2)),
          Number(previousRevenue.toFixed(2)),
        ),
        profitPercent: percentChange(
          Number(profit.toFixed(2)),
          Number(previousProfit.toFixed(2)),
        ),
        paidOrderPercent: percentChange(
          paidOrderCount,
          previousPaidOrderCount,
        ),
        averageOrderValuePercent: percentChange(
          Number(averageOrderValue.toFixed(2)),
          Number(previousAverageOrderValue.toFixed(2)),
        ),
        previous: {
          dateFrom: previousRange.dateFrom,
          dateTo: previousRange.dateTo,
          revenue: previousRevenue.toFixed(2),
          profit: previousProfit.toFixed(2),
          paidOrderCount: previousPaidOrderCount,
          averageOrderValue: previousAverageOrderValue.toFixed(2),
        },
      },
      // Legacy fields for pre-C2 frontend (same period aggregates).
      todayRevenue: revenue.toFixed(2),
      ordersCount: createdOrderCount,
      successfulPayments: successAttemptCount,
      failedPayments: failedAttemptCount,
      pendingFulfillment: pendingDelivery + processing + waitingAdminRetry,
    };
  }

  /** Daily B2C retail paid series (exclude eSIM + admin-test). */
  private queryDashboardSeries(fromInclusive: Date, toExclusive: Date) {
    return this.prisma.$queryRaw<DashboardSeriesRow[]>`
      WITH paid AS (
        SELECT DISTINCT ON (o.id)
          o.id,
          o.sell_amount,
          o.provider_cost,
          o.payment_fee_amount,
          pay.paid_at
        FROM orders o
        INNER JOIN payments pay
          ON pay.order_id = o.id
          AND pay.deleted_at IS NULL
          AND pay.status = 'SUCCESS'
          AND pay.paid_at >= ${fromInclusive}
          AND pay.paid_at < ${toExclusive}
        WHERE o.deleted_at IS NULL
          AND o.channel = 'B2C'
          AND o.payment_status = 'PAID'
          AND (o.client_trace->>'adminTest') IS DISTINCT FROM 'true'
          AND NOT EXISTS (
            SELECT 1
            FROM order_items oi
            INNER JOIN product_variants pv ON pv.id = oi.variant_id
            WHERE oi.order_id = o.id
              AND pv.type = 'ESIM'
          )
        ORDER BY o.id, pay.paid_at ASC
      )
      SELECT
        to_char((paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh'), 'YYYY-MM-DD') AS day,
        COALESCE(SUM(sell_amount), 0) AS revenue,
        COALESCE(SUM(sell_amount - provider_cost - payment_fee_amount), 0) AS profit,
        COUNT(*)::int AS paid_orders
      FROM paid
      GROUP BY 1
      ORDER BY 1
    `;
  }

  /** Revenue mix by product home_service for paid B2C retail orders. */
  private queryDashboardBreakdown(fromInclusive: Date, toExclusive: Date) {
    return this.prisma.$queryRaw<DashboardBreakdownRow[]>`
      WITH paid AS (
        SELECT DISTINCT ON (o.id)
          o.id,
          o.sell_amount
        FROM orders o
        INNER JOIN payments pay
          ON pay.order_id = o.id
          AND pay.deleted_at IS NULL
          AND pay.status = 'SUCCESS'
          AND pay.paid_at >= ${fromInclusive}
          AND pay.paid_at < ${toExclusive}
        WHERE o.deleted_at IS NULL
          AND o.channel = 'B2C'
          AND o.payment_status = 'PAID'
          AND (o.client_trace->>'adminTest') IS DISTINCT FROM 'true'
          AND NOT EXISTS (
            SELECT 1
            FROM order_items oi
            INNER JOIN product_variants pv ON pv.id = oi.variant_id
            WHERE oi.order_id = o.id
              AND pv.type = 'ESIM'
          )
        ORDER BY o.id, pay.paid_at ASC
      ),
      order_service AS (
        SELECT DISTINCT ON (oi.order_id)
          oi.order_id,
          COALESCE(pr.home_service::text, 'OTHER') AS service
        FROM order_items oi
        INNER JOIN product_variants pv ON pv.id = oi.variant_id
        INNER JOIN products pr ON pr.id = pv.product_id
        WHERE oi.order_id IN (SELECT id FROM paid)
        ORDER BY oi.order_id, oi.created_at ASC
      )
      SELECT
        os.service,
        COUNT(*)::int AS order_count,
        COALESCE(SUM(p.sell_amount), 0) AS revenue
      FROM order_service os
      INNER JOIN paid p ON p.id = os.order_id
      GROUP BY 1
      ORDER BY revenue DESC
    `;
  }

  findOrdersAdmin(query: AdminOrderQueryDto) {
    const where: Prisma.OrderWhereInput = {
      ...ACTIVE_ORDER_WHERE,
      ...buildAdminOrderWhere(query),
    };

    const pagination = resolveAdminPagination(query.skip, query.take);

    return this.prisma.order.findMany({
      where,
      include: {
        orderItems: {
          include: {
            variant: { select: { sku: true, name: true, type: true } },
          },
        },
        user: { select: { id: true, email: true, phone: true } },
        agent: { select: { id: true, companyName: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    });
  }

  async aggregateOrdersAdmin(query: AdminOrderQueryDto) {
    const where: Prisma.OrderWhereInput = {
      ...ACTIVE_ORDER_WHERE,
      ...EXCLUDE_ADMIN_TEST_ORDERS,
      ...buildAdminOrderWhere(query),
    };

    const paidWhere: Prisma.OrderWhereInput = {
      ...where,
      paymentStatus: OrderPaymentStatus.PAID,
    };

    const [financialAgg, orderCount, deliveredCount] = await Promise.all([
      this.prisma.order.aggregate({
        where: paidWhere,
        _sum: {
          sellAmount: true,
          providerCost: true,
          paymentFeeAmount: true,
        },
      }),
      this.prisma.order.count({ where }),
      this.prisma.order.count({
        where: {
          ...where,
          fulfillmentStatus: FulfillmentStatus.COMPLETED,
        },
      }),
    ]);

    const totalRevenue = financialAgg._sum.sellAmount ?? new Decimal(0);
    const providerCost = financialAgg._sum.providerCost ?? new Decimal(0);
    const gatewayFee = financialAgg._sum.paymentFeeAmount ?? new Decimal(0);
    const profit = totalRevenue.sub(providerCost).sub(gatewayFee);
    const successRate = orderCount > 0 ? (deliveredCount / orderCount) * 100 : 0;

    return {
      totalRevenue: totalRevenue.toFixed(2),
      providerCost: providerCost.toFixed(2),
      gatewayFee: gatewayFee.toFixed(2),
      profit: profit.toFixed(2),
      orderCount,
      deliveredCount,
      successRate: Math.round(successRate * 100) / 100,
    };
  }

  findOrderById(id: string) {
    return this.prisma.order.findFirst({
      where: { id, ...ACTIVE_ORDER_WHERE },
      include: {
        orderItems: {
          include: {
            variant: { select: { sku: true, name: true } },
          },
        },
        user: { select: { id: true, email: true } },
        payments: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        providerTransactions: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });
  }

  findAgentsAdmin(filters: {
    status?: AgentStatus;
    skip?: number;
    take?: number;
  }) {
    const pagination = resolveAdminPagination(filters.skip, filters.take);

    return this.prisma.agent.findMany({
      where: {
        deletedAt: null,
        status: filters.status,
      },
      include: {
        kyc: { select: { status: true } },
        user: { select: { id: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    });
  }

  findAgentById(id: string) {
    return this.prisma.agent.findFirst({
      where: { id, deletedAt: null },
      include: {
        kyc: true,
        user: { select: { id: true, email: true, role: true } },
      },
    });
  }

  listProviderStatus() {
    return this.prisma.provider.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        balance: true,
        lastBalanceSyncedAt: true,
        status: true,
      },
      orderBy: { code: 'asc' },
    });
  }

  findRecentProviderFailures(providerId: string, take = 5) {
    return this.prisma.providerLog.findMany({
      where: { providerId },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        action: true,
        status: true,
        errorMessage: true,
        createdAt: true,
        orderId: true,
      },
    });
  }

  countProviderTransactionsToday(providerId: string, status?: string) {
    const start = vietnamDayBounds(vietnamCalendarDate()).start;
    return this.prisma.providerTransaction.count({
      where: {
        providerId,
        deletedAt: null,
        createdAt: { gte: start },
        ...(status ? { status: status as never } : {}),
      },
    });
  }

  findProviderBalance(providerId: string) {
    return this.prisma.providerBalance.findUnique({
      where: { providerId },
    });
  }

  findAuditLogs(filters: {
    userId?: string;
    action?: string;
    dateFrom?: Date;
    dateTo?: Date;
    skip?: number;
    take?: number;
  }) {
    const where: Prisma.AuditLogWhereInput = {};

    if (filters.userId) {
      where.adminId = filters.userId;
    }
    if (filters.action) {
      where.action = { contains: filters.action, mode: 'insensitive' };
    }
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) {
        where.createdAt.gte = filters.dateFrom;
      }
      if (filters.dateTo) {
        where.createdAt.lte = filters.dateTo;
      }
    }

    const pagination = resolveAdminPagination(filters.skip, filters.take);

    return this.prisma.auditLog.findMany({
      where,
      include: {
        admin: { select: { id: true, email: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    });
  }

  private buildPaymentsAdminWhere(filters: {
    gateway?: PaymentGatewayCode;
    status?: PaymentRecordStatus;
    dateFrom?: Date;
    dateTo?: Date;
    amount?: string;
  }): Prisma.PaymentWhereInput {
    const where: Prisma.PaymentWhereInput = { ...ACTIVE_PAYMENT_WHERE };

    if (filters.gateway) {
      where.gateway = filters.gateway;
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) {
        where.createdAt.gte = filters.dateFrom;
      }
      if (filters.dateTo) {
        where.createdAt.lte = filters.dateTo;
      }
    }
    if (filters.amount) {
      where.amount = new Decimal(filters.amount);
    }

    return where;
  }

  findPaymentsAdmin(filters: {
    gateway?: PaymentGatewayCode;
    status?: PaymentRecordStatus;
    dateFrom?: Date;
    dateTo?: Date;
    amount?: string;
    skip?: number;
    take?: number;
  }) {
    const pagination = resolveAdminPagination(filters.skip, filters.take);

    return this.prisma.payment.findMany({
      where: this.buildPaymentsAdminWhere(filters),
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    });
  }

  countPaymentsAdmin(filters: {
    gateway?: PaymentGatewayCode;
    status?: PaymentRecordStatus;
    dateFrom?: Date;
    dateTo?: Date;
    amount?: string;
  }) {
    return this.prisma.payment.count({
      where: this.buildPaymentsAdminWhere(filters),
    });
  }

  findOrderDetailById(id: string) {
    return this.prisma.order.findFirst({
      where: { id, ...ACTIVE_ORDER_WHERE },
      include: {
        orderItems: {
          include: {
            variant: { select: { sku: true, name: true, type: true } },
            cardRecords: true,
          },
        },
        user: {
          select: { id: true, email: true, phone: true, username: true, fullName: true },
        },
        payments: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
        },
        providerTransactions: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          include: { provider: { select: { code: true, name: true } } },
        },
        providerLogs: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        topupTransactions: {
          orderBy: { createdAt: 'desc' },
        },
        orderEvents: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  findAuditLogsByTarget(targetId: string, targetType?: string) {
    return this.prisma.auditLog.findMany({
      where: {
        OR: [
          { targetId, ...(targetType ? { targetType: targetType as never } : {}) },
          {
            targetType: 'ORDER',
            targetId,
          },
        ],
      },
      include: {
        admin: { select: { email: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  private buildCustomerListWhere(filters: {
    q?: string;
    status?: UserStatus;
    createdFrom?: Date;
    createdToExclusive?: Date;
  }): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {
      role: 'CUSTOMER',
      deletedAt: null,
    };
    if (filters.status) where.status = filters.status;
    if (filters.createdFrom || filters.createdToExclusive) {
      where.createdAt = {};
      if (filters.createdFrom) where.createdAt.gte = filters.createdFrom;
      if (filters.createdToExclusive) where.createdAt.lt = filters.createdToExclusive;
    }
    if (filters.q) {
      const q = filters.q.trim();
      const uuidLike =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          q,
        );
      where.OR = [
        ...(uuidLike ? [{ id: q }] : []),
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { username: { contains: q, mode: 'insensitive' } },
        { fullName: { contains: q, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  async findCustomers(filters: {
    q?: string;
    status?: UserStatus;
    createdFrom?: Date;
    createdToExclusive?: Date;
    skip?: number;
    take?: number;
  }) {
    const where = this.buildCustomerListWhere(filters);
    const pagination = resolveAdminPagination(filters.skip, filters.take);
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          fullName: true,
          email: true,
          phone: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, skip: pagination.skip, take: pagination.take };
  }

  /**
   * Customer Center growth KPIs (CUSTOMER role only).
   * - `lifetime`: fleet totals (ignore period chip)
   * - `inPeriod`: accounts registered in the selected ICT window (+ guest buyers)
   * - `series`: daily signups for that window
   */
  async getCustomerGrowthStats(periodRaw?: string | null) {
    const range = resolveCustomerStatsPeriodRange(periodRaw);

    const baseCustomer: Prisma.UserWhereInput = {
      role: 'CUSTOMER',
      deletedAt: null,
    };
    const inPeriodCustomer: Prisma.UserWhereInput = {
      ...baseCustomer,
      createdAt: { gte: range.fromInclusive, lt: range.toExclusive },
    };

    const paidOrderSome: Prisma.OrderListRelationFilter = {
      some: {
        ...ACTIVE_ORDER_WHERE,
        ...EXCLUDE_ADMIN_TEST_ORDERS,
        paymentStatus: OrderPaymentStatus.PAID,
      },
    };

    const guestPaidInPeriod: Prisma.OrderWhereInput = {
      ...ACTIVE_ORDER_WHERE,
      ...EXCLUDE_ADMIN_TEST_ORDERS,
      paymentStatus: OrderPaymentStatus.PAID,
      agentId: null,
      userId: null,
      guestEmail: { not: null },
      createdAt: { gte: range.fromInclusive, lt: range.toExclusive },
    };

    const [
      lifetimeTotal,
      lifetimeActive,
      lifetimeSuspended,
      lifetimeBanned,
      lifetimeVerified,
      lifetimeBuyers,
      periodSignups,
      periodActive,
      periodSuspended,
      periodBanned,
      periodVerified,
      periodBuyers,
      seriesRows,
      guestBuyerEmails,
    ] = await Promise.all([
      this.prisma.user.count({ where: baseCustomer }),
      this.prisma.user.count({
        where: { ...baseCustomer, status: UserStatus.ACTIVE },
      }),
      this.prisma.user.count({
        where: { ...baseCustomer, status: UserStatus.SUSPENDED },
      }),
      this.prisma.user.count({
        where: { ...baseCustomer, status: UserStatus.BANNED },
      }),
      this.prisma.user.count({
        where: { ...baseCustomer, emailVerifiedAt: { not: null } },
      }),
      this.prisma.user.count({
        where: { ...baseCustomer, orders: paidOrderSome },
      }),
      this.prisma.user.count({ where: inPeriodCustomer }),
      this.prisma.user.count({
        where: { ...inPeriodCustomer, status: UserStatus.ACTIVE },
      }),
      this.prisma.user.count({
        where: { ...inPeriodCustomer, status: UserStatus.SUSPENDED },
      }),
      this.prisma.user.count({
        where: { ...inPeriodCustomer, status: UserStatus.BANNED },
      }),
      this.prisma.user.count({
        where: { ...inPeriodCustomer, emailVerifiedAt: { not: null } },
      }),
      this.prisma.user.count({
        where: { ...inPeriodCustomer, orders: paidOrderSome },
      }),
      this.prisma.$queryRaw<Array<{ day: string; signups: bigint | number }>>`
        SELECT to_char((u.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'), 'YYYY-MM-DD') AS day,
               COUNT(*)::int AS signups
        FROM users u
        WHERE u.role = 'CUSTOMER'
          AND u.deleted_at IS NULL
          AND u.created_at >= ${range.fromInclusive}
          AND u.created_at < ${range.toExclusive}
        GROUP BY 1
        ORDER BY 1
      `,
      this.prisma.order.findMany({
        where: guestPaidInPeriod,
        select: { guestEmail: true },
        distinct: ['guestEmail'],
      }),
    ]);

    const byDay = new Map<string, number>();
    for (const row of seriesRows) {
      byDay.set(row.day, Number(row.signups));
    }
    const series = enumerateVietnamDates(range.dateFrom, range.dateTo).map(
      (date) => ({
        date,
        signups: byDay.get(date) ?? 0,
      }),
    );

    return {
      period: {
        preset: range.preset,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        timezone: range.timezone,
        dayCount: range.dayCount,
      },
      lifetime: {
        total: lifetimeTotal,
        active: lifetimeActive,
        suspended: lifetimeSuspended,
        banned: lifetimeBanned,
        emailVerified: lifetimeVerified,
        buyers: lifetimeBuyers,
      },
      inPeriod: {
        signups: periodSignups,
        active: periodActive,
        suspended: periodSuspended,
        banned: periodBanned,
        emailVerified: periodVerified,
        buyers: periodBuyers,
        guestBuyers: guestBuyerEmails.length,
      },
      series,
    };
  }

  findCustomerById(id: string, orderSkip = 0, orderTake = 10) {
    const pagination = resolveAdminPagination(orderSkip, orderTake);
    return this.prisma.user.findFirst({
      where: { id, role: 'CUSTOMER', deletedAt: null },
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        phone: true,
        status: true,
        emailVerifiedAt: true,
        acceptedTermsAt: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        orders: {
          where: { ...ACTIVE_ORDER_WHERE, ...EXCLUDE_ADMIN_TEST_ORDERS },
          select: {
            id: true,
            orderCode: true,
            totalAmount: true,
            paymentStatus: true,
            fulfillmentStatus: true,
            createdAt: true,
            orderItems: {
              select: {
                quantity: true,
                variant: {
                  select: {
                    name: true,
                    product: { select: { name: true } },
                  },
                },
              },
              take: 3,
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: pagination.skip,
          take: pagination.take,
        },
        _count: {
          select: {
            orders: { where: { ...ACTIVE_ORDER_WHERE, ...EXCLUDE_ADMIN_TEST_ORDERS } },
          },
        },
      },
    });
  }

  private customerOrderBaseWhere(userId: string): Prisma.OrderWhereInput {
    return {
      userId,
      ...ACTIVE_ORDER_WHERE,
      ...EXCLUDE_ADMIN_TEST_ORDERS,
    };
  }

  /**
   * Order KPIs counted on distinct Order rows (prisma order.count), never payment attempts.
   * - successful = PAID + COMPLETED
   * - failedOrCancelled = FAILED/EXPIRED payment OR fulfillment FAILED; excludes REFUNDED
   * - refunded = paymentStatus REFUNDED (own bucket)
   */
  async aggregateCustomerOrderKpis(userId: string) {
    const base = this.customerOrderBaseWhere(userId);
    const [
      totalOrders,
      successfulOrders,
      failedOrCancelledOrders,
      refundedOrders,
      paidAgg,
    ] = await Promise.all([
      this.prisma.order.count({ where: base }),
      this.prisma.order.count({
        where: {
          ...base,
          paymentStatus: OrderPaymentStatus.PAID,
          fulfillmentStatus: FulfillmentStatus.COMPLETED,
        },
      }),
      this.prisma.order.count({
        where: {
          ...base,
          NOT: { paymentStatus: OrderPaymentStatus.REFUNDED },
          OR: [
            {
              paymentStatus: {
                in: [OrderPaymentStatus.FAILED, OrderPaymentStatus.EXPIRED],
              },
            },
            { fulfillmentStatus: FulfillmentStatus.FAILED },
          ],
        },
      }),
      this.prisma.order.count({
        where: {
          ...base,
          paymentStatus: OrderPaymentStatus.REFUNDED,
        },
      }),
      this.prisma.order.aggregate({
        where: {
          ...base,
          paymentStatus: OrderPaymentStatus.PAID,
        },
        _sum: { totalAmount: true },
      }),
    ]);

    return {
      totalOrders,
      successfulOrders,
      failedOrCancelledOrders,
      refundedOrders,
      totalPaidAmount: paidAgg._sum.totalAmount ?? new Decimal(0),
    };
  }

  sumCustomerPaidTotal(userId: string) {
    return this.prisma.order.aggregate({
      where: {
        ...this.customerOrderBaseWhere(userId),
        paymentStatus: OrderPaymentStatus.PAID,
      },
      _sum: { totalAmount: true },
    });
  }

  /**
   * Best-effort auth events from audit_logs (customer self-actor pattern in AuthService).
   * AuthService writes LOGIN_* with adminId=targetId=customerId — exclude admin lock/unlock
   * (different actions) and staff logins (different targetId).
   * Not a dedicated Customer Login History table.
   */
  async findCustomerLoginAuditEvents(
    customerId: string,
    skip = 0,
    take = 10,
  ) {
    const pagination = resolveAdminPagination(skip, take);
    const where: Prisma.AuditLogWhereInput = {
      targetType: AuditTargetType.USER,
      targetId: customerId,
      adminId: customerId,
      action: { in: ['LOGIN_SUCCESS', 'LOGIN_FAILED'] },
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        select: {
          id: true,
          action: true,
          ipAddress: true,
          createdAt: true,
          metadata: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, skip: pagination.skip, take: pagination.take };
  }

  findStaffUsers(filters: { skip?: number; take?: number }) {
    const pagination = resolveAdminPagination(filters.skip, filters.take);
    return this.prisma.user.findMany({
      where: {
        role: { in: ['SUPPORT', 'MARKETING', 'ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'] },
        deletedAt: null,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    });
  }

  globalSearch(
    q: string,
    scope: {
      orders: boolean;
      users: boolean;
      payments: boolean;
      providerTransactions: boolean;
    },
  ) {
    type SearchOrder = {
      id: string;
      orderCode: string;
      paymentStatus: string;
      fulfillmentStatus: string;
    };
    type SearchUser = {
      id: string;
      email: string;
      username: string | null;
      role: string;
      status: string;
    };
    type SearchPayment = {
      id: string;
      paymentReference: string;
      gateway: string;
      orderId: string;
      status: string;
    };
    type SearchProviderTx = {
      id: string;
      orderId: string;
      requestId: string;
      providerTransactionId: string | null;
      status: string;
    };

    const term = q.trim();
    const ilike = { contains: term, mode: 'insensitive' as const };
    return Promise.all([
      scope.orders
        ? this.prisma.order.findMany({
            where: {
              ...ACTIVE_ORDER_WHERE,
              OR: [{ orderCode: ilike }, { guestEmail: ilike }, { guestPhone: ilike }],
            },
            select: { id: true, orderCode: true, paymentStatus: true, fulfillmentStatus: true },
            take: 10,
          })
        : Promise.resolve([] as SearchOrder[]),
      scope.users
        ? this.prisma.user.findMany({
            where: {
              deletedAt: null,
              OR: [{ email: ilike }, { phone: ilike }, { username: ilike }],
            },
            select: { id: true, email: true, username: true, role: true, status: true },
            take: 10,
          })
        : Promise.resolve([] as SearchUser[]),
      scope.payments
        ? this.prisma.payment.findMany({
            where: {
              ...ACTIVE_PAYMENT_WHERE,
              OR: [{ paymentReference: ilike }],
            },
            select: { id: true, paymentReference: true, gateway: true, orderId: true, status: true },
            take: 10,
          })
        : Promise.resolve([] as SearchPayment[]),
      scope.providerTransactions
        ? this.prisma.providerTransaction.findMany({
            where: {
              deletedAt: null,
              OR: [
                { providerTransactionId: ilike },
                { providerReference: ilike },
                { requestId: ilike },
              ],
            },
            select: {
              id: true,
              orderId: true,
              requestId: true,
              providerTransactionId: true,
              status: true,
            },
            take: 10,
          })
        : Promise.resolve([] as SearchProviderTx[]),
    ]);
  }

  updateOrderFulfillmentStatus(orderId: string, fulfillmentStatus: FulfillmentStatus) {
    return this.prisma.order.update({
      where: { id: orderId },
      data: { fulfillmentStatus },
    });
  }

  countOrderCards(orderId: string) {
    return this.prisma.cardRecord.count({
      where: {
        orderItem: { orderId },
      },
    });
  }

  findCardRecordById(cardRecordId: string) {
    return this.prisma.cardRecord.findUnique({
      where: { id: cardRecordId },
      include: {
        orderItem: { select: { orderId: true } },
      },
    });
  }

  findUserPasswordHash(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });
  }
}
