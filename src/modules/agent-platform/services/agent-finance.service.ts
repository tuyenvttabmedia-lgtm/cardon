import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AgentStatementPaymentStatus,
  AgentStatementStatus,
  FulfillmentStatus,
  LedgerEntryType,
  LedgerReferenceType,
  OrderChannel,
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
import { AgentDepositService } from '../../agent-deposit/services/agent-deposit.service';
import {
  mapLedgerToPortalType,
  signedAmount,
} from '../utils/ledger-portal.mapper';
import { AgentWalletService, WalletLedgerQuery } from './agent-wallet.service';

export interface FinanceQuery extends WalletLedgerQuery {
  category?: string;
}

type StatementSummary = {
  orders?: number;
  successOrders?: number;
  grossRevenue?: string;
  manualAdjustment?: string;
  netRevenue?: string;
};

@Injectable()
export class AgentFinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentRepository: AgentRepository,
    private readonly ledgerService: LedgerService,
    private readonly walletService: AgentWalletService,
    private readonly depositService: AgentDepositService,
    private readonly notificationService: NotificationService,
    private readonly activityDispatcher: ActivityEventDispatcher,
  ) {}

  async getOverview(userId: string) {
    const agent = await this.requireAgent(userId);
    const [wallet, balance, startOfDay, startOfMonth] = [
      await this.walletService.getOverview(userId),
      await this.ledgerService.getBalance(agent.id),
      this.startOfToday(),
      this.startOfMonth(),
    ];

    const [revenueToday, monthRevenue, monthOrders, depositSummary] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          agentId: agent.id,
          channel: OrderChannel.AGENT,
          deletedAt: null,
          createdAt: { gte: startOfDay },
          fulfillmentStatus: FulfillmentStatus.COMPLETED,
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.order.aggregate({
        where: {
          agentId: agent.id,
          channel: OrderChannel.AGENT,
          deletedAt: null,
          createdAt: { gte: startOfMonth },
          fulfillmentStatus: FulfillmentStatus.COMPLETED,
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.order.count({
        where: {
          agentId: agent.id,
          channel: OrderChannel.AGENT,
          deletedAt: null,
          createdAt: { gte: startOfMonth },
          fulfillmentStatus: FulfillmentStatus.COMPLETED,
        },
      }),
      this.depositService.getDepositSummary(agent.id),
    ]);

    const revenueTodayStr = revenueToday._sum.totalAmount?.toFixed(2) ?? '0.00';
    const creditLimit = new Decimal(0);
    const usedCredit = balance.balance;

    return {
      availableBalance: wallet.availableBalance,
      pendingSettlement: wallet.pendingSettlement,
      creditLimit: creditLimit.toFixed(2),
      creditUsed: usedCredit,
      creditRemaining: creditLimit.sub(usedCredit).toFixed(2),
      pendingDeposit: depositSummary.pendingDeposit,
      pendingWithdraw: wallet.pendingWithdraw,
      revenueToday: revenueTodayStr,
      discountToday: '0.00',
      monthProfit: '0.00',
      monthRevenue: monthRevenue._sum.totalAmount?.toFixed(2) ?? '0.00',
      monthOrders,
      cashFlowTrend7: wallet.balanceTrend7,
      cashFlowTrend30: wallet.balanceTrend30,
      unreadNotifications: wallet.unreadNotifications,
      currency: 'VND' as const,
    };
  }

  async listDeposits(userId: string, query: FinanceQuery) {
    const agent = await this.requireAgent(userId);
    const result = await this.depositService.listDeposits(
      agent.id,
      query.skip ?? 0,
      Math.min(query.take ?? 25, 100),
      query.dateFrom,
      query.dateTo,
    );
    return { ...result, readOnly: false };
  }

  createDeposit(
    userId: string,
    email: string | undefined,
    amount: number,
    idempotencyKey: string,
    gateway?: import('@prisma/client').PaymentGatewayCode,
    role?: string,
  ) {
    this.assertCanCreateDeposit(role);
    return this.depositService.createDeposit(userId, amount, idempotencyKey, gateway, email);
  }

  getDeposit(userId: string, depositId: string, email?: string) {
    return this.depositService.getDeposit(userId, depositId).then((view) => {
      void this.depositService.logActivity(userId, email, 'view_detail', { depositId });
      return view;
    });
  }

  refreshDeposit(userId: string, depositId: string, email?: string) {
    return this.depositService.refreshDeposit(userId, depositId);
  }

  assertCanCreateDeposit(role?: string) {
    if (role === 'READONLY') {
      throw new ForbiddenException('Readonly role cannot create deposits');
    }
  }

  listWithdraws(userId: string, query: FinanceQuery) {
    return this.walletService.listWithdraws(userId, query);
  }

  async getSettlements(userId: string, query: FinanceQuery) {
    const agent = await this.requireAgent(userId);
    const skip = query.skip ?? 0;
    const take = Math.min(query.take ?? 25, 100);
    const where = this.partnerStatementWhere(agent.id);

    const [rows, total] = await Promise.all([
      this.prisma.agentStatement.findMany({
        where,
        orderBy: { periodStart: 'desc' },
        skip,
        take,
        include: {
          invoice: { select: { invoiceNumber: true, metadata: true } },
        },
      }),
      this.prisma.agentStatement.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.mapStatementToSettlementRow(row, row.invoice)),
      total,
      skip,
      take,
      readOnly: true,
      agentId: agent.id,
    };
  }

  async getSettlement(userId: string, statementId: string) {
    const agent = await this.requireAgent(userId);
    const statement = await this.prisma.agentStatement.findFirst({
      where: { id: statementId, ...this.partnerStatementWhere(agent.id) },
      include: {
        invoice: { select: { invoiceNumber: true, status: true, totalAmount: true, metadata: true } },
      },
    });
    if (!statement) throw new NotFoundException('Settlement statement not found');

    const adjustments = await this.prisma.agentStatementAdjustment.findMany({
      where: { agentId: agent.id, statementId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      ...this.mapStatementToSettlementRow(statement, statement.invoice),
      summary: statement.summary,
      invoiceStatus: statement.invoice?.status ?? null,
      invoiceAmount: statement.invoice?.totalAmount.toFixed(2) ?? null,
      adjustments: adjustments.map((a) => ({
        id: a.id,
        amount: a.amount.toFixed(2),
        reason: a.reason,
        createdAt: a.createdAt.toISOString(),
      })),
      timeline: this.buildPartnerTimeline(statement, adjustments, statement.invoice),
      readOnly: true,
    };
  }

  async listAdjustments(userId: string, query: FinanceQuery) {
    const agent = await this.requireAgent(userId);
    const skip = query.skip ?? 0;
    const take = Math.min(query.take ?? 25, 100);

    const where: Prisma.LedgerEntryWhereInput = {
      agentId: agent.id,
      deletedAt: null,
      OR: [
        { referenceType: LedgerReferenceType.ADJUSTMENT },
        { referenceType: LedgerReferenceType.REFUND },
        { referenceType: LedgerReferenceType.TOPUP },
        {
          AND: [
            { referenceType: LedgerReferenceType.TRANSACTION },
            { description: { contains: 'commission', mode: 'insensitive' } },
          ],
        },
      ],
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
        type: mapLedgerToPortalType(entry),
        amount: signedAmount(entry),
        description: entry.description ?? entry.referenceType,
        operator: entry.createdBy?.email ?? null,
        status: 'COMPLETED',
      })),
      total,
      skip,
      take,
      readOnly: true,
    };
  }

  async getCredit(userId: string) {
    const limits = await this.walletService.getLimits(userId);
    return {
      ...limits,
      issuedAt: null as string | null,
      expiresAt: null as string | null,
      approvedBy: null as string | null,
      creditUsed: limits.creditLimit,
      creditRemaining: limits.remainingLimit,
    };
  }

  async listHistory(userId: string, query: FinanceQuery) {
    const result = await this.walletService.listLedger(userId, query);
    return {
      ...result,
      items: result.items.map((item) => ({
        ...item,
        category: this.historyCategory(item.type),
      })),
    };
  }

  async getNotifications(userId: string) {
    const notifications = await this.notificationService.listUserNotifications(userId);
    const items = Array.isArray(notifications)
      ? notifications
      : ((notifications as { items?: unknown[] }).items ?? []);
    return { items: items.slice(0, 20) };
  }

  logActivity(
    userId: string,
    email: string | undefined,
    action: 'view_detail' | 'filter' | 'export_csv' | 'export_excel' | 'export_pdf',
    metadata?: Record<string, unknown>,
  ) {
    const eventType =
      action === 'export_excel'
        ? SystemActivityEventType.EXPORT_EXCEL
        : SystemActivityEventType.EXPORT_CSV;

    this.activityDispatcher.dispatch({
      eventType,
      eventCategory: SystemActivityEventCategory.FINANCE,
      severity: SystemActivitySeverity.INFO,
      source: SystemActivitySource.PARTNER,
      resource: 'agent_finance',
      resourceId: userId,
      title: `Finance ${action.replace('_', ' ')}`,
      description: `Agent finance center ${action}`,
      performedBy: userId,
      performedEmail: email ?? null,
      metadata: { action, ...metadata },
    });
  }

  assertCanExport(role: string) {
    if (role === 'READONLY') {
      throw new ForbiddenException('Readonly role cannot export finance data');
    }
  }

  private historyCategory(type: string): string {
    const map: Record<string, string> = {
      DEPOSIT: 'NAP_TIEN',
      WITHDRAW: 'RUT_TIEN',
      PURCHASE: 'MUA_HANG',
      REFUND: 'HOAN_TIEN',
      ADJUSTMENT: 'DIEU_CHINH',
      MANUAL_CREDIT: 'CONG_TIEN',
      MANUAL_DEBIT: 'TRU_TIEN',
      SETTLEMENT: 'DOI_SOAT',
      COMMISSION: 'CHIET_KHAU',
    };
    return map[type] ?? type;
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

  private async requireAgent(userId: string) {
    const agent = await this.agentRepository.findByUserId(userId);
    if (!agent) throw new NotFoundException('Agent profile not found');
    return agent;
  }

  private partnerStatementWhere(agentId: string): Prisma.AgentStatementWhereInput {
    return {
      agentId,
      deletedAt: null,
      status: {
        in: [AgentStatementStatus.LOCKED, AgentStatementStatus.INVOICED, AgentStatementStatus.PAID],
      },
      paymentStatus: { not: AgentStatementPaymentStatus.CANCELLED },
    };
  }

  private mapStatementToSettlementRow(
    statement: {
      id: string;
      periodLabel: string;
      periodStart: Date;
      periodEnd: Date;
      status: AgentStatementStatus;
      paymentStatus: AgentStatementPaymentStatus;
      summary: unknown;
      invoiceId: string | null;
      lockedAt: Date | null;
      updatedAt: Date;
    },
    invoice?: { invoiceNumber: string; metadata: unknown } | null,
  ) {
    const summary = (statement.summary ?? {}) as StatementSummary;
    return {
      id: statement.id,
      cycle: statement.periodLabel,
      periodStart: statement.periodStart.toISOString(),
      periodEnd: statement.periodEnd.toISOString(),
      status: statement.status,
      paymentStatus: statement.paymentStatus,
      orderCount: summary.successOrders ?? summary.orders ?? 0,
      revenue: summary.grossRevenue ?? '0',
      discount: summary.manualAdjustment ?? '0',
      profit: summary.netRevenue ?? '0',
      netRevenue: summary.netRevenue ?? '0',
      paidAt: this.resolveStatementPaidAt(statement, invoice),
      invoiceNumber: invoice?.invoiceNumber ?? null,
      invoiceId: statement.invoiceId,
      lockedAt: statement.lockedAt?.toISOString() ?? null,
    };
  }

  private resolveStatementPaidAt(
    statement: { paymentStatus: AgentStatementPaymentStatus; updatedAt: Date },
    invoice?: { metadata: unknown } | null,
  ): string | null {
    if (statement.paymentStatus !== AgentStatementPaymentStatus.PAID) return null;
    if (invoice?.metadata && typeof invoice.metadata === 'object') {
      const paidAt = (invoice.metadata as Record<string, unknown>).paidAt;
      if (typeof paidAt === 'string') return paidAt;
    }
    return statement.updatedAt.toISOString();
  }

  private buildPartnerTimeline(
    statement: {
      status: AgentStatementStatus;
      generatedAt: Date;
      lockedAt: Date | null;
      invoiceId: string | null;
      paymentStatus: AgentStatementPaymentStatus;
      updatedAt: Date;
    },
    adjustments: Array<{ createdAt: Date; amount: Decimal; reason: string }>,
    invoice?: { metadata: unknown } | null,
  ) {
    const events: Array<{ at: string; label: string; detail?: string }> = [
      { at: statement.generatedAt.toISOString(), label: 'CardOn tạo sao kê' },
    ];
    for (const adj of adjustments) {
      events.push({
        at: adj.createdAt.toISOString(),
        label: 'Điều chỉnh',
        detail: `${adj.amount.toFixed(2)} · ${adj.reason}`,
      });
    }
    if (statement.lockedAt) {
      events.push({ at: statement.lockedAt.toISOString(), label: 'CardOn khóa sao kê' });
    }
    if (statement.invoiceId && statement.lockedAt) {
      events.push({ at: statement.lockedAt.toISOString(), label: 'Hóa đơn phát hành' });
    }
    if (statement.paymentStatus === AgentStatementPaymentStatus.PAID) {
      events.push({
        at: this.resolveStatementPaidAt(statement, invoice) ?? statement.updatedAt.toISOString(),
        label: 'Đã thanh toán',
      });
    }
    return events.sort((a, b) => a.at.localeCompare(b.at));
  }
}
