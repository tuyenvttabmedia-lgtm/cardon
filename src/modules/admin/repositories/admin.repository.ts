import { Injectable } from '@nestjs/common';
import {
  AgentStatus,
  FulfillmentStatus,
  OrderPaymentStatus,
  PaymentGatewayCode,
  PaymentRecordStatus,
  Prisma,
  ProviderTransactionStatus,
  UserStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../database/prisma.service';
import { ACTIVE_ORDER_WHERE } from '../../order/entities/order.constants';
import { ACTIVE_PAYMENT_WHERE } from '../../payment/entities/payment.constants';
import { resolveAdminPagination } from '../utils/admin-pagination.util';
import { AdminOrderQueryDto } from '../dto/admin.dto';
import { buildAdminOrderWhere } from '../utils/admin-order-filter.util';

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

@Injectable()
export class AdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardStats() {
    const today = startOfToday();

    const [
      todayOrders,
      todayPaidOrders,
      successfulPayments,
      failedPayments,
      pendingFulfillment,
      providerErrors,
      agentStats,
    ] = await Promise.all([
      this.prisma.order.count({
        where: { ...ACTIVE_ORDER_WHERE, createdAt: { gte: today } },
      }),
      this.prisma.order.findMany({
        where: {
          ...ACTIVE_ORDER_WHERE,
          paymentStatus: OrderPaymentStatus.PAID,
          createdAt: { gte: today },
        },
        select: { totalAmount: true },
      }),
      this.prisma.payment.count({
        where: {
          ...ACTIVE_PAYMENT_WHERE,
          status: PaymentRecordStatus.SUCCESS,
          paidAt: { gte: today },
        },
      }),
      this.prisma.payment.count({
        where: {
          ...ACTIVE_PAYMENT_WHERE,
          status: PaymentRecordStatus.FAILED,
          updatedAt: { gte: today },
        },
      }),
      this.prisma.order.count({
        where: {
          ...ACTIVE_ORDER_WHERE,
          fulfillmentStatus: {
            in: [
              FulfillmentStatus.PENDING,
              FulfillmentStatus.PROCESSING,
              FulfillmentStatus.WAITING_ADMIN_RETRY,
            ],
          },
        },
      }),
      this.prisma.providerLog.count({
        where: {
          createdAt: { gte: today },
          status: ProviderTransactionStatus.FAILED,
        },
      }),
      this.prisma.agent.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: { id: true },
      }),
    ]);

    const todayRevenue = todayPaidOrders.reduce(
      (sum, row) => sum.add(row.totalAmount),
      new Decimal(0),
    );

    const agentsByStatus = Object.fromEntries(
      agentStats.map((row) => [row.status, row._count.id]),
    );

    return {
      todayRevenue: todayRevenue.toFixed(2),
      ordersCount: todayOrders,
      successfulPayments,
      failedPayments,
      pendingFulfillment,
      providerErrors,
      agentStatistics: {
        total: agentStats.reduce((sum, row) => sum + row._count.id, 0),
        active: agentsByStatus[AgentStatus.ACTIVE] ?? 0,
        pendingKyc: agentsByStatus[AgentStatus.PENDING_KYC] ?? 0,
        suspended: agentsByStatus[AgentStatus.SUSPENDED] ?? 0,
        rejected: agentsByStatus[AgentStatus.REJECTED] ?? 0,
      },
      currency: 'VND' as const,
      asOf: new Date().toISOString(),
    };
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
      },
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    });
  }

  async aggregateOrdersAdmin(query: AdminOrderQueryDto) {
    const where: Prisma.OrderWhereInput = {
      ...ACTIVE_ORDER_WHERE,
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
    const start = new Date();
    start.setHours(0, 0, 0, 0);
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

  findCustomers(filters: {
    q?: string;
    status?: UserStatus;
    skip?: number;
    take?: number;
  }) {
    const where: Prisma.UserWhereInput = {
      role: 'CUSTOMER',
      deletedAt: null,
    };
    if (filters.status) where.status = filters.status;
    if (filters.q) {
      const q = filters.q.trim();
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { username: { contains: q, mode: 'insensitive' } },
        { fullName: { contains: q, mode: 'insensitive' } },
      ];
    }
    const pagination = resolveAdminPagination(filters.skip, filters.take);
    return this.prisma.user.findMany({
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
    });
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
        orders: {
          where: ACTIVE_ORDER_WHERE,
          select: {
            id: true,
            orderCode: true,
            totalAmount: true,
            paymentStatus: true,
            fulfillmentStatus: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          skip: pagination.skip,
          take: pagination.take,
        },
        _count: {
          select: {
            orders: { where: ACTIVE_ORDER_WHERE },
          },
        },
      },
    });
  }

  sumCustomerPaidTotal(userId: string) {
    return this.prisma.order.aggregate({
      where: {
        userId,
        deletedAt: null,
        paymentStatus: 'PAID',
        ...ACTIVE_ORDER_WHERE,
      },
      _sum: { totalAmount: true },
    });
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
