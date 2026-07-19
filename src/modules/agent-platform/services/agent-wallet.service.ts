import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AgentStatementPaymentStatus,
  AgentStatementStatus,
  FulfillmentStatus,
  LedgerEntryType,
  LedgerReferenceType,
  OrderChannel,
  AgentDepositStatus,
  Prisma,
  SystemActivityEventCategory,
  SystemActivityEventType,
  SystemActivitySeverity,
  SystemActivitySource,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../database/prisma.service';
import { ActivityEventDispatcher } from '../../activity-event/activity-event-dispatcher.service';
import { AgentRepository } from '../../agent/repositories/agent.repository';
import { LedgerService } from '../../agent/services/ledger.service';
import { NotificationService } from '../../notification/services/notification.service';
import {
  ledgerEntryStatus,
  mapLedgerToPortalType,
  PortalLedgerType,
  signedAmount,
} from '../utils/ledger-portal.mapper';

export interface WalletLedgerQuery {
  skip?: number;
  take?: number;
  dateFrom?: string;
  dateTo?: string;
  type?: string;
  status?: string;
  orderId?: string;
  reference?: string;
  amountMin?: string;
  amountMax?: string;
  search?: string;
}

@Injectable()
export class AgentWalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentRepository: AgentRepository,
    private readonly ledgerService: LedgerService,
    private readonly notificationService: NotificationService,
    private readonly activityDispatcher: ActivityEventDispatcher,
  ) {}

  async getOverview(userId: string) {
    const agent = await this.requireAgentByUser(userId);
    const balance = await this.ledgerService.getBalance(agent.id);
    const startOfDay = this.startOfToday();
    const startOfMonth = this.startOfMonth();

    const [todayDebits, monthDebits, lastEntry, trend7, trend30, unreadNotifications, pendingDeposits, creditedToday, creditedMonth] =
      await Promise.all([
        this.sumDebits(agent.id, startOfDay),
        this.sumDebits(agent.id, startOfMonth),
        this.prisma.ledgerEntry.findFirst({
          where: { agentId: agent.id, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
        this.buildTrend(agent.id, 7),
        this.buildTrend(agent.id, 30),
        this.notificationService.countUnreadUserNotifications(userId),
        this.prisma.agentDeposit.aggregate({
          where: {
            agentId: agent.id,
            deletedAt: null,
            status: { in: [AgentDepositStatus.INIT, AgentDepositStatus.AWAITING_PAYMENT] },
          },
          _sum: { amount: true },
        }),
        this.prisma.agentDeposit.aggregate({
          where: {
            agentId: agent.id,
            deletedAt: null,
            status: AgentDepositStatus.CREDITED,
            creditedAt: { gte: startOfDay },
          },
          _sum: { netAmount: true },
        }),
        this.prisma.agentDeposit.aggregate({
          where: {
            agentId: agent.id,
            deletedAt: null,
            status: AgentDepositStatus.CREDITED,
            creditedAt: { gte: startOfMonth },
          },
          _sum: { netAmount: true },
        }),
      ]);

    return {
      availableBalance: balance.availableBalance,
      frozenBalance: balance.heldBalance,
      currentBalance: balance.balance,
      creditLimit: '0.00',
      pendingDeposit: pendingDeposits._sum.amount?.toFixed(2) ?? '0.00',
      pendingWithdraw: '0.00',
      pendingSettlement: '0.00',
      todaySpending: todayDebits,
      monthSpending: monthDebits,
      todayCommission: creditedToday._sum.netAmount?.toFixed(2) ?? '0.00',
      depositedToday: creditedToday._sum.netAmount?.toFixed(2) ?? '0.00',
      depositedMonth: creditedMonth._sum.netAmount?.toFixed(2) ?? '0.00',
      discountTier: 'STANDARD',
      lastUpdated: lastEntry?.createdAt.toISOString() ?? new Date().toISOString(),
      balanceTrend7: trend7,
      balanceTrend30: trend30,
      unreadNotifications,
      currency: 'VND' as const,
    };
  }

  async getSummary(userId: string, dateFrom?: string, dateTo?: string) {
    const agent = await this.requireAgentByUser(userId);
    const range = this.resolveRange(dateFrom, dateTo);

    const [priorEntry, entries] = await Promise.all([
      this.prisma.ledgerEntry.findFirst({
        where: {
          agentId: agent.id,
          deletedAt: null,
          createdAt: { lt: range.from },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.ledgerEntry.findMany({
        where: {
          agentId: agent.id,
          deletedAt: null,
          createdAt: { gte: range.from, lte: range.to },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const balance = await this.ledgerService.getBalance(agent.id);
    const opening = priorEntry
      ? {
          balance: priorEntry.afterBalance.toFixed(2),
          held: priorEntry.afterHeld.toFixed(2),
          available: priorEntry.afterBalance.sub(priorEntry.afterHeld).toFixed(2),
        }
      : entries.length > 0
        ? {
            balance: entries[0].beforeBalance.toFixed(2),
            held: entries[0].beforeHeld.toFixed(2),
            available: entries[0].beforeBalance.sub(entries[0].beforeHeld).toFixed(2),
          }
        : {
            balance: balance.balance,
            held: balance.heldBalance,
            available: balance.availableBalance,
          };

    let credits = new Decimal(0);
    let debits = new Decimal(0);
    for (const entry of entries) {
      if (entry.type === LedgerEntryType.CREDIT || entry.type === LedgerEntryType.RELEASE) {
        credits = credits.add(entry.amount);
      }
      if (entry.type === LedgerEntryType.DEBIT || entry.type === LedgerEntryType.HOLD) {
        debits = debits.add(entry.amount);
      }
    }

    const lastEntry = entries.at(-1);
    const closing = lastEntry
      ? {
          balance: lastEntry.afterBalance.toFixed(2),
          held: lastEntry.afterHeld.toFixed(2),
          available: lastEntry.afterBalance.sub(lastEntry.afterHeld).toFixed(2),
        }
      : opening;

    return {
      period: { from: range.from.toISOString(), to: range.to.toISOString() },
      openingBalance: opening,
      credits: credits.toFixed(2),
      debits: debits.toFixed(2),
      closingBalance: closing,
      pendingAmount: balance.heldBalance,
      frozenAmount: balance.heldBalance,
      availableAmount: balance.availableBalance,
      currency: 'VND' as const,
    };
  }

  async listLedger(userId: string, query: WalletLedgerQuery) {
    const agent = await this.requireAgentByUser(userId);
    const skip = query.skip ?? 0;
    const take = Math.min(query.take ?? 25, 100);
    const where = this.buildLedgerWhere(agent.id, query);

    const [rows, total] = await Promise.all([
      this.prisma.ledgerEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          createdBy: { select: { email: true } },
        },
      }),
      this.prisma.ledgerEntry.count({ where }),
    ]);

    return {
      items: rows.map((entry) => this.toLedgerRow(entry)),
      total,
      skip,
      take,
    };
  }

  async getLedgerDetail(userId: string, entryId: string) {
    const agent = await this.requireAgentByUser(userId);
    const entry = await this.prisma.ledgerEntry.findFirst({
      where: { id: entryId, agentId: agent.id, deletedAt: null },
      include: {
        createdBy: { select: { id: true, email: true } },
      },
    });
    if (!entry) throw new NotFoundException('Ledger entry not found');

    const portalType = mapLedgerToPortalType(entry);
    const relatedOrder =
      entry.referenceType === LedgerReferenceType.ORDER
        ? await this.prisma.order.findUnique({
            where: { id: entry.referenceId },
            select: {
              id: true,
              orderCode: true,
              agentRequestId: true,
              totalAmount: true,
              fulfillmentStatus: true,
            },
          })
        : null;

    const timeline = await this.prisma.ledgerEntry.findMany({
      where: {
        agentId: agent.id,
        referenceId: entry.referenceId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    return {
      ...this.toLedgerRow(entry),
      source: entry.referenceType,
      order: relatedOrder
        ? {
            id: relatedOrder.id,
            orderCode: relatedOrder.orderCode,
            requestId: relatedOrder.agentRequestId,
            amount: relatedOrder.totalAmount.toFixed(2),
            status: relatedOrder.fulfillmentStatus,
          }
        : null,
      operator: entry.createdBy
        ? { id: entry.createdBy.id, email: entry.createdBy.email }
        : null,
      timeline: timeline.map((t) => this.toLedgerRow(t)),
      auditTrail: timeline.map((t) => ({
        at: t.createdAt.toISOString(),
        type: mapLedgerToPortalType(t),
        amount: signedAmount(t),
        status: ledgerEntryStatus(t),
      })),
    };
  }

  async listDeposits(userId: string, query: WalletLedgerQuery) {
    const agent = await this.requireAgentByUser(userId);
    const skip = query.skip ?? 0;
    const take = Math.min(query.take ?? 25, 100);

    const where: Prisma.LedgerEntryWhereInput = {
      agentId: agent.id,
      deletedAt: null,
      type: LedgerEntryType.CREDIT,
      referenceType: LedgerReferenceType.TOPUP,
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.ledgerEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { createdBy: { select: { email: true } } },
      }),
      this.prisma.ledgerEntry.count({ where }),
    ]);

    return {
      items: rows.map((entry) => ({
        id: entry.id,
        time: entry.createdAt.toISOString(),
        reference: entry.referenceId,
        amount: entry.amount.toFixed(2),
        gateway: entry.createdById ? 'ADMIN_CREDIT' : 'MANUAL',
        status: 'COMPLETED' as const,
        approvedBy: entry.createdBy?.email ?? null,
        completedAt: entry.createdAt.toISOString(),
        description: entry.description,
      })),
      total,
      skip,
      take,
      readOnly: true,
    };
  }

  async listWithdraws(userId: string, query: WalletLedgerQuery) {
    return {
      items: [] as Array<Record<string, unknown>>,
      total: 0,
      skip: query.skip ?? 0,
      take: query.take ?? 25,
      readOnly: true,
      foundation: true,
    };
  }

  async getLimits(userId: string) {
    const agent = await this.requireAgentByUser(userId);
    const balance = await this.ledgerService.getBalance(agent.id);
    const creditLimit = new Decimal(0);
    const dailyLimit = new Decimal(0);
    const monthlyLimit = new Decimal(0);
    const utilization = creditLimit.gt(0)
      ? new Decimal(balance.balance).div(creditLimit).mul(100).toFixed(2)
      : '0.00';

    return {
      creditLimit: creditLimit.toFixed(2),
      dailyPurchaseLimit: dailyLimit.toFixed(2),
      monthlyPurchaseLimit: monthlyLimit.toFixed(2),
      currentUtilization: utilization,
      remainingLimit: creditLimit.sub(balance.balance).toFixed(2),
      status: 'ACTIVE' as const,
      readOnly: true,
      agentId: agent.id,
    };
  }

  async getRecentActivity(userId: string) {
    const agent = await this.requireAgentByUser(userId);
    const [ledger, orders, notificationList, pendingSettlement] = await Promise.all([
      this.prisma.ledgerEntry.findMany({
        where: { agentId: agent.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      this.prisma.order.findMany({
        where: { agentId: agent.id, channel: OrderChannel.AGENT, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          orderCode: true,
          totalAmount: true,
          fulfillmentStatus: true,
          createdAt: true,
        },
      }),
      this.notificationService.listUserNotifications(userId),
      this.prisma.agentStatement.count({
        where: {
          agentId: agent.id,
          deletedAt: null,
          status: { in: [AgentStatementStatus.LOCKED, AgentStatementStatus.INVOICED] },
          paymentStatus: { notIn: [AgentStatementPaymentStatus.PAID, AgentStatementPaymentStatus.CANCELLED] },
        },
      }),
    ]);

    const notificationItems = Array.isArray(notificationList)
      ? notificationList
      : ((notificationList as { items?: unknown[] }).items ?? []);

    return {
      ledgerEntries: ledger.map((e) => this.toLedgerRow(e)),
      recentOrders: orders.map((o) => ({
        id: o.id,
        orderCode: o.orderCode,
        amount: o.totalAmount.toFixed(2),
        status: o.fulfillmentStatus,
        createdAt: o.createdAt.toISOString(),
      })),
      notifications: notificationItems.slice(0, 5),
      pendingItems: {
        deposits: 0,
        withdraws: 0,
        settlement: pendingSettlement,
      },
    };
  }

  logActivity(
    userId: string,
    email: string | undefined,
    action: 'view_detail' | 'filter' | 'export_csv' | 'export_excel' | 'export_pdf',
    metadata?: Record<string, unknown>,
  ) {
    const eventType =
      action === 'export_csv'
        ? SystemActivityEventType.EXPORT_CSV
        : action === 'export_excel'
          ? SystemActivityEventType.EXPORT_EXCEL
          : SystemActivityEventType.EXPORT_CSV;

    this.activityDispatcher.dispatch({
      eventType,
      eventCategory: SystemActivityEventCategory.FINANCE,
      severity: SystemActivitySeverity.INFO,
      source: SystemActivitySource.PARTNER,
      resource: 'agent_wallet',
      resourceId: userId,
      title: `Wallet ${action.replace('_', ' ')}`,
      description: `Agent wallet ${action}`,
      performedBy: userId,
      performedEmail: email ?? null,
      metadata: { action, ...metadata },
    });
  }

  assertCanExport(role: string) {
    if (role === 'READONLY') {
      throw new ForbiddenException('Readonly role cannot export wallet data');
    }
  }

  private toLedgerRow(
    entry: {
      id: string;
      type: LedgerEntryType;
      referenceType: LedgerReferenceType;
      referenceId: string;
      description: string | null;
      amount: Decimal;
      beforeBalance: Decimal;
      afterBalance: Decimal;
      beforeHeld: Decimal;
      afterHeld: Decimal;
      createdAt: Date;
      createdById: string | null;
      createdBy?: { email: string } | null;
    },
  ) {
    const portalType = mapLedgerToPortalType(entry);
    return {
      id: entry.id,
      time: entry.createdAt.toISOString(),
      referenceNo: entry.referenceId,
      orderId: entry.referenceType === LedgerReferenceType.ORDER ? entry.referenceId : null,
      type: portalType,
      description: entry.description ?? entry.referenceType,
      amount: signedAmount(entry),
      balanceBefore: entry.beforeBalance.toFixed(2),
      balanceAfter: entry.afterBalance.toFixed(2),
      heldBefore: entry.beforeHeld.toFixed(2),
      heldAfter: entry.afterHeld.toFixed(2),
      operator: entry.createdBy?.email ?? null,
      status: ledgerEntryStatus(entry),
      rawType: entry.type,
      referenceType: entry.referenceType,
    };
  }

  private buildLedgerWhere(agentId: string, query: WalletLedgerQuery): Prisma.LedgerEntryWhereInput {
    const and: Prisma.LedgerEntryWhereInput[] = [{ agentId, deletedAt: null }];

    if (query.dateFrom || query.dateTo) {
      and.push({
        createdAt: {
          ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
          ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
        },
      });
    }

    if (query.orderId) {
      and.push({ referenceType: LedgerReferenceType.ORDER, referenceId: query.orderId });
    }

    if (query.reference) {
      const ref = query.reference.trim();
      const uuidLike = /^[0-9a-f-]{36}$/i.test(ref);
      if (uuidLike) {
        and.push({ referenceId: ref });
      } else {
        and.push({
          OR: [
            { description: { contains: ref, mode: 'insensitive' } },
          ],
        });
      }
    }

    if (query.amountMin || query.amountMax) {
      and.push({
        amount: {
          ...(query.amountMin ? { gte: new Decimal(query.amountMin) } : {}),
          ...(query.amountMax ? { lte: new Decimal(query.amountMax) } : {}),
        },
      });
    }

    if (query.search?.trim()) {
      const q = query.search.trim();
      and.push({
        OR: [
          { description: { contains: q, mode: 'insensitive' } },
          ...( /^[0-9a-f-]{36}$/i.test(q) ? [{ referenceId: q }] : []),
        ],
      });
    }

    if (query.type) {
      const typeFilter = this.portalTypeToPrismaFilter(query.type as PortalLedgerType);
      if (typeFilter) and.push(typeFilter);
    }

    return { AND: and };
  }

  private portalTypeToPrismaFilter(type: PortalLedgerType): Prisma.LedgerEntryWhereInput | null {
    switch (type) {
      case 'DEPOSIT':
      case 'MANUAL_CREDIT':
        return { type: LedgerEntryType.CREDIT, referenceType: LedgerReferenceType.TOPUP };
      case 'PURCHASE':
        return { type: LedgerEntryType.DEBIT, referenceType: LedgerReferenceType.ORDER };
      case 'REFUND':
        return { type: LedgerEntryType.CREDIT, referenceType: LedgerReferenceType.REFUND };
      case 'ADJUSTMENT':
      case 'MANUAL_DEBIT':
        return { referenceType: LedgerReferenceType.ADJUSTMENT };
      case 'HOLD':
        return { type: LedgerEntryType.HOLD };
      case 'RELEASE':
        return { type: LedgerEntryType.RELEASE };
      default:
        return null;
    }
  }

  private async sumDebits(agentId: string, since: Date): Promise<string> {
    const agg = await this.prisma.ledgerEntry.aggregate({
      where: {
        agentId,
        deletedAt: null,
        createdAt: { gte: since },
        type: { in: [LedgerEntryType.DEBIT, LedgerEntryType.HOLD] },
      },
      _sum: { amount: true },
    });
    return agg._sum.amount?.toFixed(2) ?? '0.00';
  }

  private async buildTrend(agentId: string, days: number) {
    const points: Array<{ date: string; balance: string }> = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const dayEnd = new Date();
      dayEnd.setHours(23, 59, 59, 999);
      dayEnd.setDate(dayEnd.getDate() - i);
      const entry = await this.prisma.ledgerEntry.findFirst({
        where: { agentId, deletedAt: null, createdAt: { lte: dayEnd } },
        orderBy: { createdAt: 'desc' },
      });
      points.push({
        date: dayEnd.toISOString().slice(0, 10),
        balance: entry?.afterBalance.toFixed(2) ?? '0.00',
      });
    }
    return points;
  }

  private resolveRange(dateFrom?: string, dateTo?: string) {
    const to = dateTo ? new Date(dateTo) : new Date();
    const from = dateFrom ? new Date(dateFrom) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid date range');
    }
    return { from, to };
  }

  private startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private startOfMonth() {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private async requireAgentByUser(userId: string) {
    const agent = await this.agentRepository.findByUserId(userId);
    if (!agent) throw new NotFoundException('Agent profile not found');
    return agent;
  }
}
