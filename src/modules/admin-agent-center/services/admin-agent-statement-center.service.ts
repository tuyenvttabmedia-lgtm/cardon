import { randomUUID } from 'node:crypto';
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
  InvoiceStatus,
  InvoiceType,
  LedgerReferenceType,
  OrderChannel,
  OrderPaymentStatus,
  Prisma,
  SystemAuditAction,
  SystemAuditResource,
  UserRole,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../database/prisma.service';
import { AuditLogService } from '../../audit-log/services/audit-log.service';
import { LedgerService } from '../../agent/services/ledger.service';
import { FinanceRepository } from '../../finance/repositories/finance.repository';
import { InvoiceService } from '../../finance/services/invoice.service';
import { resolveAdminPagination } from '../../admin/utils/admin-pagination.util';
import {
  AgentAdjustmentsQueryDto,
  AgentStatementExportQueryDto,
  AgentStatementOrdersQueryDto,
  AgentStatementPeriodQueryDto,
  CreateAgentStatementAdjustmentDto,
  GenerateAgentStatementDto,
} from '../dto/admin-agent-statement.dto';
import { AdminAgentCenterTabQueryDto } from '../dto/admin-agent-center.dto';

type PeriodRange = { from: Date; to: Date; label: string };

export type StatementSummary = {
  orders: number;
  successOrders: number;
  failedOrders: number;
  refundOrders: number;
  grossRevenue: string;
  providerCost: string;
  cardonProfit: string;
  manualAdjustment: string;
  netRevenue: string;
  pendingInvoice: number;
  paidInvoice: number;
};

@Injectable()
export class AdminAgentStatementCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly financeRepository: FinanceRepository,
    private readonly invoiceService: InvoiceService,
    private readonly auditLog: AuditLogService,
  ) {}

  async getDashboard(agentId: string, query: AgentStatementPeriodQueryDto) {
    await this.requireAgent(agentId);
    const period = this.resolvePeriod(query);
    const summary = await this.computeSummary(agentId, period.from, period.to);
    const statements = await this.prisma.agentStatement.findMany({
      where: { agentId, deletedAt: null },
      orderBy: { periodStart: 'desc' },
      take: 12,
      select: {
        id: true,
        periodLabel: true,
        status: true,
        paymentStatus: true,
        generatedAt: true,
        lockedAt: true,
        invoiceId: true,
      },
    });

    return {
      period: { from: period.from.toISOString(), to: period.to.toISOString(), label: period.label },
      cards: summary,
      statements,
      canWrite: true,
    };
  }

  async listStatements(agentId: string) {
    await this.requireAgent(agentId);
    const items = await this.prisma.agentStatement.findMany({
      where: { agentId, deletedAt: null },
      orderBy: { periodStart: 'desc' },
      include: { invoice: { select: { invoiceNumber: true, status: true, totalAmount: true } } },
    });
    return {
      items: items.map((s) => {
        const summary = s.summary as StatementSummary | null;
        return {
          id: s.id,
          periodLabel: s.periodLabel,
          periodStart: s.periodStart.toISOString(),
          periodEnd: s.periodEnd.toISOString(),
          status: s.status,
          paymentStatus: s.paymentStatus,
          summary: s.summary,
          netRevenue: summary?.netRevenue ?? '0',
          invoiceId: s.invoiceId,
          invoiceNumber: s.invoice?.invoiceNumber ?? null,
          lockedAt: s.lockedAt?.toISOString() ?? null,
          generatedAt: s.generatedAt.toISOString(),
        };
      }),
    };
  }

  async getStatement(agentId: string, statementId: string) {
    const statement = await this.requireStatement(agentId, statementId);
    const adjustments = await this.prisma.agentStatementAdjustment.findMany({
      where: { agentId, statementId },
      orderBy: { createdAt: 'desc' },
    });
    return {
      ...this.mapStatement(statement),
      adjustments: adjustments.map((a) => this.mapAdjustment(a)),
      timeline: this.buildTimeline(statement, adjustments),
    };
  }

  async getStatementOrders(agentId: string, query: AgentStatementOrdersQueryDto) {
    await this.requireAgent(agentId);
    const period = this.resolvePeriod(query);
    const pagination = resolveAdminPagination(query.skip, query.take ?? 20);
    const where: Prisma.OrderWhereInput = {
      agentId,
      channel: OrderChannel.AGENT,
      deletedAt: null,
      createdAt: { gte: period.from, lte: period.to },
    };
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { orderCode: { contains: q, mode: 'insensitive' } },
        { agentRequestId: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
        include: {
          orderItems: {
            include: { variant: { select: { sku: true, name: true, faceValue: true } } },
          },
          providerTransactions: {
            take: 1,
            select: {
              providerReference: true,
              provider: { select: { code: true } },
            },
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      period: { from: period.from.toISOString(), to: period.to.toISOString() },
      items: orders.map((o) => this.mapOrderLine(o)),
      total,
      skip: pagination.skip,
      take: pagination.take,
    };
  }

  async generateStatement(
    agentId: string,
    dto: GenerateAgentStatementDto,
    admin: { id: string; email: string; role?: UserRole },
  ) {
    await this.requireAgent(agentId);
    this.assertFinanceWrite(admin.role);
    const period = this.resolvePeriod(dto);
    const existing = await this.prisma.agentStatement.findFirst({
      where: { agentId, periodLabel: period.label, deletedAt: null },
    });
    const summary = await this.computeSummary(
      agentId,
      period.from,
      period.to,
      existing?.id,
    );
    if (existing && existing.status !== AgentStatementStatus.DRAFT) {
      throw new BadRequestException('Statement period already locked or invoiced');
    }

    const data = {
      periodStart: period.from,
      periodEnd: period.to,
      summary: summary as unknown as Prisma.InputJsonValue,
      generatedAt: new Date(),
      generatedById: admin.id,
      generatedByEmail: admin.email,
      status: AgentStatementStatus.DRAFT,
    };

    const statement = existing
      ? await this.prisma.agentStatement.update({ where: { id: existing.id }, data })
      : await this.prisma.agentStatement.create({
          data: { agentId, periodLabel: period.label, ...data },
        });

    this.auditLog.create({
      resource: SystemAuditResource.PRICING,
      action: SystemAuditAction.CREATE,
      resourceId: statement.id,
      resourceName: `Statement ${period.label}`,
      fieldName: 'agent_statement',
      newValue: { agentId, periodLabel: period.label, summary },
      performedBy: admin.id,
      performedEmail: admin.email,
      performedRole: admin.role ?? UserRole.ADMIN,
      reason: dto.reason ?? 'Tạo sao kê đại lý',
    });

    return this.getStatement(agentId, statement.id);
  }

  async lockStatement(
    agentId: string,
    statementId: string,
    admin: { id: string; email: string; role?: UserRole },
    reason?: string,
  ) {
    this.assertFinanceWrite(admin.role);
    const statement = await this.requireStatement(agentId, statementId);
    if (statement.status !== AgentStatementStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT statements can be locked');
    }

    const summary = await this.computeSummary(agentId, statement.periodStart, statement.periodEnd, statementId);
    const updated = await this.prisma.agentStatement.update({
      where: { id: statementId },
      data: {
        status: AgentStatementStatus.LOCKED,
        summary: summary as unknown as Prisma.InputJsonValue,
        lockedAt: new Date(),
        lockedById: admin.id,
        lockedByEmail: admin.email,
      },
    });

    this.auditLog.create({
      resource: SystemAuditResource.PRICING,
      action: SystemAuditAction.UPDATE,
      resourceId: statementId,
      fieldName: 'status',
      oldValue: AgentStatementStatus.DRAFT,
      newValue: AgentStatementStatus.LOCKED,
      performedBy: admin.id,
      performedEmail: admin.email,
      performedRole: admin.role ?? UserRole.ADMIN,
      reason: reason ?? 'Khóa sao kê đại lý',
    });

    return this.mapStatement(updated);
  }

  async createAdjustment(
    agentId: string,
    dto: CreateAgentStatementAdjustmentDto,
    admin: { id: string; email: string; role?: UserRole },
  ) {
    await this.requireAgent(agentId);
    this.assertFinanceWrite(admin.role);

    if (dto.statementId) {
      const st = await this.requireStatement(agentId, dto.statementId);
      if (st.status === AgentStatementStatus.LOCKED || st.status === AgentStatementStatus.INVOICED || st.status === AgentStatementStatus.PAID) {
        // locked ok for adjustment with manual override
      }
      if (st.status === AgentStatementStatus.PAID) {
        throw new BadRequestException('Cannot adjust paid statement');
      }
    }

    const amount = new Decimal(dto.amount);
    let ledgerEntryId: string | null = null;

    if (dto.applyToWallet && amount.gt(0)) {
      const entry = await this.ledgerService.credit(
        agentId,
        amount,
        LedgerReferenceType.ADJUSTMENT,
        randomUUID(),
        admin.id,
        dto.reason,
      );
      ledgerEntryId = entry.id;
    }

    const row = await this.prisma.agentStatementAdjustment.create({
      data: {
        agentId,
        statementId: dto.statementId ?? null,
        amount,
        reason: dto.reason,
        ledgerEntryId,
        createdById: admin.id,
        createdByEmail: admin.email,
      },
    });

    if (dto.statementId) {
      const st = await this.requireStatement(agentId, dto.statementId);
      if (st.status === AgentStatementStatus.DRAFT) {
        const summary = await this.computeSummary(agentId, st.periodStart, st.periodEnd);
        await this.prisma.agentStatement.update({
          where: { id: dto.statementId },
          data: { summary: summary as unknown as Prisma.InputJsonValue },
        });
      }
    }

    this.auditLog.create({
      resource: SystemAuditResource.PRICING,
      action: SystemAuditAction.CREATE,
      resourceId: row.id,
      fieldName: 'agent_statement_adjustment',
      newValue: { agentId, amount: amount.toFixed(2), reason: dto.reason },
      performedBy: admin.id,
      performedEmail: admin.email,
      performedRole: admin.role ?? UserRole.ADMIN,
      reason: dto.reason,
    });

    return this.mapAdjustment(row);
  }

  async listAdjustments(agentId: string, query: AgentAdjustmentsQueryDto) {
    await this.requireAgent(agentId);
    const pagination = resolveAdminPagination(query.skip, query.take ?? 20);
    const where: Prisma.AgentStatementAdjustmentWhereInput = { agentId };
    if (query.statementId) where.statementId = query.statementId;

    const [items, total] = await Promise.all([
      this.prisma.agentStatementAdjustment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.agentStatementAdjustment.count({ where }),
    ]);

    return {
      items: items.map((a) => this.mapAdjustment(a)),
      total,
      skip: pagination.skip,
      take: pagination.take,
    };
  }

  async createInvoiceFromStatement(
    agentId: string,
    statementId: string,
    admin: { id: string; email: string; role?: UserRole },
  ) {
    this.assertFinanceWrite(admin.role);
    const statement = await this.requireStatement(agentId, statementId);
    if (statement.status !== AgentStatementStatus.LOCKED) {
      throw new BadRequestException('Statement must be LOCKED before invoicing');
    }
    if (statement.invoiceId) {
      throw new BadRequestException('Statement already has an invoice');
    }

    const summary = statement.summary as StatementSummary;
    const total = new Decimal(summary.netRevenue ?? summary.cardonProfit ?? '0');
    const invoiceNumber = await this.financeRepository.generateInvoiceNumber();

    const invoice = await this.financeRepository.createInvoice({
      invoiceNumber,
      type: InvoiceType.AGENT_STATEMENT,
      agentId,
      subtotal: total,
      taxAmount: new Decimal(0),
      totalAmount: total,
      metadata: {
        statementId,
        periodLabel: statement.periodLabel,
        periodStart: statement.periodStart.toISOString(),
        periodEnd: statement.periodEnd.toISOString(),
        summary,
      },
    });

    await this.prisma.agentStatement.update({
      where: { id: statementId },
      data: {
        invoiceId: invoice.id,
        status: AgentStatementStatus.INVOICED,
        paymentStatus: AgentStatementPaymentStatus.UNPAID,
      },
    });

    this.auditLog.create({
      resource: SystemAuditResource.PRICING,
      action: SystemAuditAction.CREATE,
      resourceId: invoice.id,
      resourceName: invoiceNumber,
      fieldName: 'agent_statement_invoice',
      newValue: { statementId, invoiceNumber },
      performedBy: admin.id,
      performedEmail: admin.email,
      performedRole: admin.role ?? UserRole.ADMIN,
      reason: 'Tạo hóa đơn từ sao kê đại lý',
    });

    return this.getInvoice(agentId, invoice.id);
  }

  async getInvoices(agentId: string, query: AdminAgentCenterTabQueryDto) {
    await this.requireAgent(agentId);
    const pagination = resolveAdminPagination(query.skip, query.take ?? 20);
    const where = {
      agentId,
      deletedAt: null,
      type: { in: [InvoiceType.AGENT_STATEMENT, InvoiceType.AGENT_TOPUP_RECEIPT, InvoiceType.MONTHLY_SUMMARY] },
    };
    const [items, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      items: items.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        type: inv.type,
        status: inv.status,
        subtotal: inv.subtotal.toFixed(2),
        taxAmount: inv.taxAmount.toFixed(2),
        totalAmount: inv.totalAmount.toFixed(2),
        paymentStatus: this.invoicePaymentStatus(inv),
        issuedAt: inv.issuedAt?.toISOString() ?? null,
        pdfUrl: inv.pdfUrl,
        metadata: inv.metadata,
        createdAt: inv.createdAt.toISOString(),
      })),
      total,
      skip: pagination.skip,
      take: pagination.take,
    };
  }

  async getInvoice(agentId: string, invoiceId: string) {
    await this.requireAgent(agentId);
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, agentId, deletedAt: null },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const metadata = invoice.metadata as Record<string, unknown>;
    const statementId = typeof metadata.statementId === 'string' ? metadata.statementId : null;
    let statement = null;
    if (statementId) {
      statement = await this.prisma.agentStatement.findUnique({ where: { id: statementId } });
    }

    return {
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        type: invoice.type,
        status: invoice.status,
        subtotal: invoice.subtotal.toFixed(2),
        taxAmount: invoice.taxAmount.toFixed(2),
        totalAmount: invoice.totalAmount.toFixed(2),
        paymentStatus: this.invoicePaymentStatus(invoice),
        issuedAt: invoice.issuedAt?.toISOString() ?? null,
        pdfUrl: invoice.pdfUrl,
        metadata: invoice.metadata,
        createdAt: invoice.createdAt.toISOString(),
      },
      statement: statement ? this.mapStatement(statement) : null,
    };
  }

  async exportStatement(agentId: string, query: AgentStatementExportQueryDto) {
    await this.requireAgent(agentId);
    const format = query.format ?? 'csv';

    if (query.statementId) {
      const statement = await this.requireStatement(agentId, query.statementId);
      const summary = statement.summary as StatementSummary;
      const orders = await this.getStatementOrders(agentId, {
        dateFrom: statement.periodStart.toISOString(),
        dateTo: statement.periodEnd.toISOString(),
        preset: 'custom',
        skip: 0,
        take: 5000,
      });
      return this.buildStatementExport(
        agentId,
        statement.periodLabel,
        summary,
        orders.items,
        orders.total,
        format,
      );
    }

    const orders = await this.getStatementOrders(agentId, { ...query, skip: 0, take: 5000 });
    if (orders.total > 5000) {
      return {
        async: true,
        message: 'Export lớn đang xử lý — thông báo sẽ gửi khi hoàn tất',
        jobId: randomUUID(),
        format,
      };
    }

    const period = this.resolvePeriod(query);
    const summary = await this.computeSummary(agentId, period.from, period.to);
    return this.buildStatementExport(agentId, period.label, summary, orders.items, orders.total, format);
  }

  async cancelDraftStatement(
    agentId: string,
    statementId: string,
    admin: { id: string; email: string; role?: UserRole },
    reason?: string,
  ) {
    this.assertFinanceWrite(admin.role);
    const statement = await this.requireStatement(agentId, statementId);
    if (statement.status !== AgentStatementStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT statements can be cancelled');
    }

    await this.prisma.agentStatement.update({
      where: { id: statementId },
      data: { deletedAt: new Date() },
    });

    this.auditLog.create({
      resource: SystemAuditResource.PRICING,
      action: SystemAuditAction.DELETE,
      resourceId: statementId,
      fieldName: 'agent_statement',
      oldValue: { periodLabel: statement.periodLabel, status: statement.status },
      performedBy: admin.id,
      performedEmail: admin.email,
      performedRole: admin.role ?? UserRole.ADMIN,
      reason: reason ?? 'Hủy sao kê nháp',
    });

    return { ok: true };
  }

  async unlockStatement(
    agentId: string,
    statementId: string,
    admin: { id: string; email: string; role?: UserRole },
    reason?: string,
  ) {
    if (admin.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only SUPER_ADMIN can unlock statements');
    }
    this.assertFinanceWrite(admin.role);
    const statement = await this.requireStatement(agentId, statementId);
    if (statement.status !== AgentStatementStatus.LOCKED) {
      throw new BadRequestException('Only LOCKED statements can be unlocked');
    }
    if (statement.invoiceId) {
      throw new BadRequestException('Statement has an invoice — void invoice first');
    }

    const updated = await this.prisma.agentStatement.update({
      where: { id: statementId },
      data: {
        status: AgentStatementStatus.DRAFT,
        lockedAt: null,
        lockedById: null,
        lockedByEmail: null,
      },
    });

    this.auditLog.create({
      resource: SystemAuditResource.PRICING,
      action: SystemAuditAction.UPDATE,
      resourceId: statementId,
      fieldName: 'status',
      oldValue: AgentStatementStatus.LOCKED,
      newValue: AgentStatementStatus.DRAFT,
      performedBy: admin.id,
      performedEmail: admin.email,
      performedRole: admin.role ?? UserRole.SUPER_ADMIN,
      reason: reason ?? 'Mở khóa sao kê',
    });

    return this.mapStatement(updated);
  }

  async markStatementPaid(
    agentId: string,
    statementId: string,
    admin: { id: string; email: string; role?: UserRole },
    note?: string,
  ) {
    this.assertFinanceWrite(admin.role);
    const statement = await this.requireStatement(agentId, statementId);
    if (
      statement.status !== AgentStatementStatus.INVOICED &&
      statement.status !== AgentStatementStatus.LOCKED
    ) {
      throw new BadRequestException('Statement must be INVOICED or LOCKED to mark paid');
    }

    const updated = await this.prisma.agentStatement.update({
      where: { id: statementId },
      data: {
        status: AgentStatementStatus.PAID,
        paymentStatus: AgentStatementPaymentStatus.PAID,
      },
    });

    if (statement.invoiceId) {
      const invoice = await this.prisma.invoice.findUnique({ where: { id: statement.invoiceId } });
      if (invoice) {
        await this.prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            metadata: {
              ...(invoice.metadata as Record<string, unknown>),
              paymentStatus: AgentStatementPaymentStatus.PAID,
              paidAt: new Date().toISOString(),
              paidNote: note ?? null,
            },
          },
        });
      }
    }

    this.auditLog.create({
      resource: SystemAuditResource.PRICING,
      action: SystemAuditAction.UPDATE,
      resourceId: statementId,
      fieldName: 'paymentStatus',
      newValue: AgentStatementPaymentStatus.PAID,
      performedBy: admin.id,
      performedEmail: admin.email,
      performedRole: admin.role ?? UserRole.ADMIN,
      reason: note ?? 'Đánh dấu sao kê đã thanh toán',
    });

    return this.mapStatement(updated);
  }

  async issueAgentInvoice(
    agentId: string,
    invoiceId: string,
    admin: { id: string; email: string; role?: UserRole },
  ) {
    this.assertFinanceWrite(admin.role);
    await this.requireAgent(agentId);
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, agentId, deletedAt: null },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const issued = await this.invoiceService.issueInvoice(admin.id, invoiceId);
    return this.getInvoice(agentId, issued.id);
  }

  async voidAgentInvoice(
    agentId: string,
    invoiceId: string,
    admin: { id: string; email: string; role?: UserRole },
    reason: string,
  ) {
    this.assertFinanceWrite(admin.role);
    await this.requireAgent(agentId);
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, agentId, deletedAt: null },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT agent invoices can be voided from agent center');
    }

    await this.invoiceService.voidInvoice(admin.id, invoiceId, { reason });

    const statement = await this.prisma.agentStatement.findFirst({
      where: { agentId, invoiceId, deletedAt: null },
    });
    if (statement) {
      await this.prisma.agentStatement.update({
        where: { id: statement.id },
        data: {
          invoiceId: null,
          status: AgentStatementStatus.LOCKED,
          paymentStatus: AgentStatementPaymentStatus.UNPAID,
        },
      });
    }

    return { ok: true };
  }

  async exportInvoice(agentId: string, invoiceId: string, format: 'csv' | 'html' = 'csv') {
    const detail = await this.getInvoice(agentId, invoiceId);
    const invoice = detail.invoice as Record<string, unknown>;
    const statement = detail.statement as Record<string, unknown> | null;
    const summary = (statement?.summary ?? (invoice.metadata as Record<string, unknown>)?.summary) as
      | StatementSummary
      | undefined;
    const invoiceNumber = String(invoice.invoiceNumber);

    if (format === 'html') {
      const fullInvoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, agentId } });
      return {
        format: 'html',
        filename: `${invoiceNumber}.html`,
        content: this.buildInvoiceHtml(fullInvoice!),
        mimeType: 'text/html',
      };
    }

    const lines = [
      'field,value',
      `invoice_number,${invoiceNumber}`,
      `period,${statement ? String(statement.periodLabel) : ''}`,
      `total_amount,${invoice.totalAmount}`,
      `tax_amount,${invoice.taxAmount}`,
      `status,${invoice.status}`,
      `payment_status,${invoice.paymentStatus}`,
    ];
    if (summary) {
      lines.push(
        `orders,${summary.orders}`,
        `gross_revenue,${summary.grossRevenue}`,
        `provider_cost,${summary.providerCost}`,
        `cardon_profit,${summary.cardonProfit}`,
        `manual_adjustment,${summary.manualAdjustment}`,
        `net_revenue,${summary.netRevenue}`,
      );
    }

    return {
      format: 'csv',
      filename: `${invoiceNumber}.csv`,
      content: lines.join('\n'),
      mimeType: 'text/csv',
    };
  }

  private buildStatementExport(
    agentId: string,
    periodLabel: string,
    summary: StatementSummary,
    orderItems: Array<Record<string, unknown>>,
    total: number,
    format: string,
  ) {
    if (total > 5000) {
      return {
        async: true,
        message: 'Export lớn đang xử lý — thông báo sẽ gửi khi hoàn tất',
        jobId: randomUUID(),
        format,
      };
    }

    const summaryLines = [
      `# Sao kê ${periodLabel}`,
      `orders,${summary.orders}`,
      `success_orders,${summary.successOrders}`,
      `gross_revenue,${summary.grossRevenue}`,
      `provider_cost,${summary.providerCost}`,
      `cardon_profit,${summary.cardonProfit}`,
      `manual_adjustment,${summary.manualAdjustment}`,
      `net_revenue,${summary.netRevenue}`,
      '',
    ];
    const header =
      'order_id,partner_order,gateway,provider,product,face_value,provider_cost,agent_price,profit,status,created_at';
    const rows = orderItems.map((o) =>
      [
        o.orderCode,
        o.partnerOrder ?? '',
        o.gateway ?? '',
        o.provider ?? '',
        `"${String(o.product).replace(/"/g, '""')}"`,
        o.faceValue,
        o.providerCost,
        o.agentPrice,
        o.profit,
        o.status,
        o.createdAt,
      ].join(','),
    );
    const csv = [...summaryLines, header, ...rows].join('\n');

    return {
      async: false,
      format,
      filename: `agent-statement-${agentId.slice(0, 8)}-${periodLabel}.${format === 'excel' ? 'xlsx' : 'csv'}`,
      content: csv,
      mimeType: 'text/csv',
    };
  }

  private buildInvoiceHtml(invoice: {
    invoiceNumber: string;
    subtotal: Decimal;
    taxAmount: Decimal;
    totalAmount: Decimal;
    status: InvoiceStatus;
    issuedAt: Date | null;
    metadata: unknown;
    createdAt: Date;
  }) {
    const meta = invoice.metadata as Record<string, unknown>;
    const summary = meta.summary as StatementSummary | undefined;
    const periodLabel = typeof meta.periodLabel === 'string' ? meta.periodLabel : '—';
    const fmt = (v: Decimal | string) => new Decimal(v).toFixed(0);

    return `<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8"/><title>${invoice.invoiceNumber}</title>
<style>
body{font-family:system-ui,sans-serif;max-width:720px;margin:2rem auto;color:#18181b}
h1{font-size:1.25rem} table{width:100%;border-collapse:collapse;margin-top:1rem}
td,th{border:1px solid #e4e4e7;padding:8px;text-align:left;font-size:14px}
th{background:#fafafa}.right{text-align:right}.muted{color:#71717a;font-size:13px}
</style></head><body>
<h1>Hóa đơn đại lý ${invoice.invoiceNumber}</h1>
<p class="muted">Kỳ sao kê: ${periodLabel} · Trạng thái: ${invoice.status}</p>
<table>
<tr><th>Mục</th><th class="right">Số tiền (VNĐ)</th></tr>
${summary ? `<tr><td>Doanh thu gộp (${summary.orders} đơn)</td><td class="right">${fmt(summary.grossRevenue)}</td></tr>
<tr><td>Giá vốn NCC</td><td class="right">${fmt(summary.providerCost)}</td></tr>
<tr><td>Lợi nhuận CardOn</td><td class="right">${fmt(summary.cardonProfit)}</td></tr>
<tr><td>Điều chỉnh</td><td class="right">${fmt(summary.manualAdjustment)}</td></tr>` : ''}
<tr><td><strong>Tổng cộng</strong></td><td class="right"><strong>${fmt(invoice.totalAmount)}</strong></td></tr>
<tr><td>VAT</td><td class="right">${fmt(invoice.taxAmount)}</td></tr>
</table>
<p class="muted">Ngày tạo: ${invoice.createdAt.toISOString().slice(0, 10)}${invoice.issuedAt ? ` · Phát hành: ${invoice.issuedAt.toISOString().slice(0, 10)}` : ''}</p>
<p class="muted">CardOn — Hóa đơn đối soát B2B đại lý</p>
</body></html>`;
  }

  private async computeSummary(
    agentId: string,
    from: Date,
    to: Date,
    statementId?: string,
  ): Promise<StatementSummary> {
    const orders = await this.prisma.order.findMany({
      where: {
        agentId,
        channel: OrderChannel.AGENT,
        deletedAt: null,
        createdAt: { gte: from, lte: to },
      },
      select: {
        totalAmount: true,
        providerCost: true,
        profit: true,
        fulfillmentStatus: true,
        paymentStatus: true,
      },
    });

    let grossRevenue = new Decimal(0);
    let providerCost = new Decimal(0);
    let cardonProfit = new Decimal(0);
    let successOrders = 0;
    let failedOrders = 0;
    let refundOrders = 0;

    for (const o of orders) {
      if (o.fulfillmentStatus === FulfillmentStatus.COMPLETED) {
        successOrders += 1;
        grossRevenue = grossRevenue.add(o.totalAmount);
        providerCost = providerCost.add(o.providerCost);
        cardonProfit = cardonProfit.add(o.profit);
      } else if (o.fulfillmentStatus === FulfillmentStatus.FAILED) {
        failedOrders += 1;
      }
      if (o.paymentStatus === OrderPaymentStatus.REFUNDED) refundOrders += 1;
    }

    const adjustments = await this.prisma.agentStatementAdjustment.findMany({
      where: statementId
        ? {
            agentId,
            OR: [{ createdAt: { gte: from, lte: to } }, { statementId }],
          }
        : {
            agentId,
            createdAt: { gte: from, lte: to },
          },
      select: { id: true, amount: true },
    });
    const seenAdj = new Set<string>();
    let manualAdjustment = new Decimal(0);
    for (const a of adjustments) {
      if (seenAdj.has(a.id)) continue;
      seenAdj.add(a.id);
      manualAdjustment = manualAdjustment.add(a.amount);
    }

    const netRevenue = cardonProfit.add(manualAdjustment);

    const [pendingInvoice, paidInvoice] = await Promise.all([
      this.prisma.agentStatement.count({
        where: {
          agentId,
          deletedAt: null,
          status: { in: [AgentStatementStatus.INVOICED] },
          paymentStatus: { in: [AgentStatementPaymentStatus.UNPAID, AgentStatementPaymentStatus.PARTIAL, AgentStatementPaymentStatus.OVERDUE] },
        },
      }),
      this.prisma.agentStatement.count({
        where: {
          agentId,
          deletedAt: null,
          paymentStatus: AgentStatementPaymentStatus.PAID,
        },
      }),
    ]);

    return {
      orders: orders.length,
      successOrders,
      failedOrders,
      refundOrders,
      grossRevenue: grossRevenue.toFixed(2),
      providerCost: providerCost.toFixed(2),
      cardonProfit: cardonProfit.toFixed(2),
      manualAdjustment: manualAdjustment.toFixed(2),
      netRevenue: netRevenue.toFixed(2),
      pendingInvoice,
      paidInvoice,
    };
  }

  private resolvePeriod(query: AgentStatementPeriodQueryDto): PeriodRange {
    const now = new Date();
    let end = query.dateTo ? new Date(query.dateTo) : now;
    end.setHours(23, 59, 59, 999);
    let start: Date;

    switch (query.preset) {
      case 'custom': {
        if (!query.dateFrom || !query.dateTo) {
          throw new BadRequestException('dateFrom and dateTo are required for custom period');
        }
        start = new Date(query.dateFrom);
        start.setHours(0, 0, 0, 0);
        end = new Date(query.dateTo);
        end.setHours(23, 59, 59, 999);
        return {
          from: start,
          to: end,
          label: this.buildPeriodLabel(start, end),
        };
      }
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        break;
      case 'last_7_days':
        start = new Date(now);
        start.setDate(start.getDate() - 6);
        start.setHours(0, 0, 0, 0);
        break;
      case 'last_month': {
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        return {
          from: start,
          to: lastDay,
          label: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
        };
      }
      case 'this_month':
      default:
        start = query.dateFrom
          ? new Date(query.dateFrom)
          : new Date(end.getFullYear(), end.getMonth(), 1);
        start.setHours(0, 0, 0, 0);
        if (query.dateTo) {
          end = new Date(query.dateTo);
          end.setHours(23, 59, 59, 999);
        }
        break;
    }

    return { from: start, to: end, label: this.buildPeriodLabel(start, end) };
  }

  private buildPeriodLabel(from: Date, to: Date): string {
    const monthStart = new Date(from.getFullYear(), from.getMonth(), 1);
    const monthEnd = new Date(from.getFullYear(), from.getMonth() + 1, 0);
    const isFullMonth =
      from.toDateString() === monthStart.toDateString() &&
      to.toDateString() === monthEnd.toDateString();
    if (isFullMonth) {
      return `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}`;
    }
    return `${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}`;
  }

  private mapOrderLine(order: {
    id: string;
    orderCode: string;
    agentRequestId: string | null;
    paymentGateway: string | null;
    faceValue: Decimal;
    providerCost: Decimal;
    totalAmount: Decimal;
    profit: Decimal;
    fulfillmentStatus: FulfillmentStatus;
    createdAt: Date;
    updatedAt: Date;
    orderItems: Array<{ variant: { name: string; sku: string; faceValue: Decimal } }>;
    providerTransactions: Array<{
      providerReference: string | null;
      provider: { code: string };
    }>;
  }) {
    const product = order.orderItems.map((i) => i.variant.name).join(', ') || '—';
    return {
      orderId: order.id,
      orderCode: order.orderCode,
      partnerOrder: order.agentRequestId,
      gateway: order.paymentGateway,
      provider: order.providerTransactions[0]?.provider?.code ?? null,
      providerRef: order.providerTransactions[0]?.providerReference ?? null,
      product,
      faceValue: order.faceValue.toFixed(2),
      providerCost: order.providerCost.toFixed(2),
      agentPrice: order.totalAmount.toFixed(2),
      profit: order.profit.toFixed(2),
      adjustment: '0.00',
      status: order.fulfillmentStatus,
      createdAt: order.createdAt.toISOString(),
      completedAt:
        order.fulfillmentStatus === FulfillmentStatus.COMPLETED
          ? order.updatedAt.toISOString()
          : null,
    };
  }

  private mapStatement(statement: {
    id: string;
    periodLabel: string;
    periodStart: Date;
    periodEnd: Date;
    status: AgentStatementStatus;
    paymentStatus: AgentStatementPaymentStatus;
    summary: unknown;
    invoiceId: string | null;
    lockedAt: Date | null;
    lockedByEmail: string | null;
    generatedAt: Date;
    generatedByEmail: string | null;
  }) {
    return {
      id: statement.id,
      periodLabel: statement.periodLabel,
      periodStart: statement.periodStart.toISOString(),
      periodEnd: statement.periodEnd.toISOString(),
      status: statement.status,
      paymentStatus: statement.paymentStatus,
      summary: statement.summary,
      invoiceId: statement.invoiceId,
      lockedAt: statement.lockedAt?.toISOString() ?? null,
      lockedByEmail: statement.lockedByEmail,
      generatedAt: statement.generatedAt.toISOString(),
      generatedByEmail: statement.generatedByEmail,
    };
  }

  private mapAdjustment(row: {
    id: string;
    amount: Decimal;
    reason: string;
    statementId: string | null;
    ledgerEntryId: string | null;
    createdByEmail: string;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      amount: row.amount.toFixed(2),
      reason: row.reason,
      statementId: row.statementId,
      ledgerEntryId: row.ledgerEntryId,
      createdByEmail: row.createdByEmail,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private buildTimeline(
    statement: { status: AgentStatementStatus; generatedAt: Date; lockedAt: Date | null; invoiceId: string | null },
    adjustments: Array<{ createdAt: Date; amount: Decimal; createdByEmail: string }>,
  ) {
    const events: Array<{ at: string; label: string; detail?: string }> = [
      {
        at: statement.generatedAt.toISOString(),
        label: 'Tạo sao kê',
      },
    ];
    for (const a of adjustments) {
      events.push({
        at: a.createdAt.toISOString(),
        label: 'Điều chỉnh thủ công',
        detail: `${a.amount.toFixed(2)} · ${a.createdByEmail}`,
      });
    }
    if (statement.lockedAt) {
      events.push({ at: statement.lockedAt.toISOString(), label: 'Khóa sao kê' });
    }
    if (statement.invoiceId) {
      events.push({ at: statement.lockedAt?.toISOString() ?? statement.generatedAt.toISOString(), label: 'Tạo hóa đơn' });
    }
    if (statement.status === AgentStatementStatus.PAID) {
      events.push({ at: statement.lockedAt?.toISOString() ?? statement.generatedAt.toISOString(), label: 'Thanh toán hoàn tất' });
    }
    return events.sort((a, b) => a.at.localeCompare(b.at));
  }

  private invoicePaymentStatus(invoice: { status: InvoiceStatus; metadata: unknown }) {
    const meta = invoice.metadata as Record<string, unknown>;
    if (typeof meta.paymentStatus === 'string') return meta.paymentStatus;
    if (invoice.status === InvoiceStatus.VOID) return AgentStatementPaymentStatus.CANCELLED;
    if (invoice.status === InvoiceStatus.ISSUED) return AgentStatementPaymentStatus.UNPAID;
    return AgentStatementPaymentStatus.UNPAID;
  }

  private assertFinanceWrite(role?: UserRole) {
    if (role === UserRole.SUPPORT || role === UserRole.MARKETING) {
      throw new ForbiddenException('Read-only role cannot modify statements');
    }
  }

  private async requireAgent(agentId: string) {
    const agent = await this.prisma.agent.findFirst({ where: { id: agentId, deletedAt: null } });
    if (!agent) throw new NotFoundException('Agent not found');
    return agent;
  }

  private async requireStatement(agentId: string, statementId: string) {
    const statement = await this.prisma.agentStatement.findFirst({
      where: { id: statementId, agentId, deletedAt: null },
    });
    if (!statement) throw new NotFoundException('Statement not found');
    return statement;
  }
}
