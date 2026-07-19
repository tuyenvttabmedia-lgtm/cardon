import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AgentDepositStatus,
  AgentManualCreditCategory,
  AgentManualCreditStatus,
  AgentManualCreditType,
  AgentStatus,
  LedgerEntryType,
  LedgerReferenceType,
  Prisma,
  SystemAuditAction,
  SystemAuditResource,
  UserRole,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  assertVndAmountRange,
  parseVndAmount,
  VND_MIN_WALLET_CREDIT,
  WALLET_ACCOUNTANT_DAILY_LIMIT,
  WALLET_APPROVAL_THRESHOLD,
} from '../../../common/utils/vnd-amount.util';
import { PrismaService } from '../../../database/prisma.service';
import { AgentDepositService } from '../../agent-deposit/services/agent-deposit.service';
import { AgentAuditService } from '../../agent/services/agent-audit.service';
import { LedgerService } from '../../agent/services/ledger.service';
import { AuditLogService } from '../../audit-log/services/audit-log.service';
import { resolveAdminPagination } from '../../admin/utils/admin-pagination.util';
import {
  AgentWalletTabQueryDto,
  CreateAgentDepositOnBehalfDto,
  CreateAgentManualCreditDto,
  CreateAgentManualDebitDto,
} from '../dto/admin-agent-wallet.dto';

const CATEGORY_LABELS: Record<AgentManualCreditCategory, string> = {
  CONTRACT: 'Hợp đồng',
  BANK_TRANSFER: 'Chuyển khoản',
  PROMOTION: 'Khuyến mãi',
  COMPENSATION: 'Bồi hoàn',
  CORRECTION: 'Hiệu chỉnh',
  OTHER: 'Khác',
};

@Injectable()
export class AdminAgentWalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly agentAudit: AgentAuditService,
    private readonly auditLog: AuditLogService,
    private readonly depositService: AgentDepositService,
  ) {}

  async getWalletCenter(agentId: string) {
    const agent = await this.requireAgent(agentId);
    const pendingDeposit = await this.prisma.agentDeposit.aggregate({
      where: {
        agentId,
        deletedAt: null,
        status: { in: [AgentDepositStatus.AWAITING_PAYMENT, AgentDepositStatus.INIT] },
      },
      _sum: { amount: true },
    });
    const pendingApprovals = await this.prisma.agentManualCredit.count({
      where: { agentId, status: AgentManualCreditStatus.PENDING_APPROVAL, deletedAt: null },
    });

    return {
      balance: agent.balance.toFixed(2),
      heldAmount: agent.heldBalance.toFixed(2),
      available: agent.balance.sub(agent.heldBalance).toFixed(2),
      pendingDeposit: (pendingDeposit._sum.amount ?? new Decimal(0)).toFixed(2),
      pendingApprovals,
      limits: {
        minCredit: VND_MIN_WALLET_CREDIT,
        approvalThreshold: WALLET_APPROVAL_THRESHOLD,
        accountantDailyLimit: WALLET_ACCOUNTANT_DAILY_LIMIT,
      },
    };
  }

  async getLedger(agentId: string, query: AgentWalletTabQueryDto) {
    await this.requireAgent(agentId);
    const pagination = resolveAdminPagination(query.skip, query.take ?? 20);
    const where: Prisma.LedgerEntryWhereInput = { agentId };
    if (query.ledgerType) where.type = query.ledgerType;
    if (query.referenceType) where.referenceType = query.referenceType;
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.description = { contains: q, mode: 'insensitive' };
    }

    const [items, total] = await Promise.all([
      this.prisma.ledgerEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
        include: {
          createdBy: { select: { email: true, fullName: true } },
        },
      }),
      this.prisma.ledgerEntry.count({ where }),
    ]);

    return {
      items: items.map((e) => ({
        id: e.id,
        type: e.type,
        amount: e.amount.toFixed(2),
        referenceType: e.referenceType,
        referenceId: e.referenceId,
        description: e.description,
        createdAt: e.createdAt.toISOString(),
        afterBalance: e.afterBalance.toFixed(2),
        createdByEmail: e.createdBy?.email ?? null,
      })),
      total,
      skip: pagination.skip,
      take: pagination.take,
    };
  }

  async getDeposits(agentId: string, query: AgentWalletTabQueryDto) {
    await this.requireAgent(agentId);
    const pagination = resolveAdminPagination(query.skip, query.take ?? 20);
    const [items, total] = await Promise.all([
      this.prisma.agentDeposit.findMany({
        where: { agentId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.agentDeposit.count({ where: { agentId, deletedAt: null } }),
    ]);

    return {
      items: items.map((d) => ({
        id: d.id,
        paymentReference: d.paymentReference,
        amount: d.amount.toFixed(2),
        netAmount: d.netAmount.toFixed(2),
        status: d.status,
        gateway: d.gateway,
        createdAt: d.createdAt.toISOString(),
        creditedAt: d.creditedAt?.toISOString() ?? null,
        expiresAt: d.expiresAt?.toISOString() ?? null,
      })),
      total,
      skip: pagination.skip,
      take: pagination.take,
    };
  }

  async getManualOperations(agentId: string, query: AgentWalletTabQueryDto) {
    await this.requireAgent(agentId);
    const pagination = resolveAdminPagination(query.skip, query.take ?? 20);
    const [items, total] = await Promise.all([
      this.prisma.agentManualCredit.findMany({
        where: { agentId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.agentManualCredit.count({ where: { agentId, deletedAt: null } }),
    ]);

    return {
      items: items.map((r) => this.mapManualCredit(r)),
      total,
      skip: pagination.skip,
      take: pagination.take,
    };
  }

  async createManualCredit(
    agentId: string,
    dto: CreateAgentManualCreditDto,
    admin: { id: string; email: string; role?: UserRole },
  ) {
    this.assertCreditRole(admin.role);
    const agent = await this.requireAgent(agentId);
    if (agent.status !== AgentStatus.ACTIVE) {
      throw new BadRequestException('Đại lý phải ACTIVE để nạp ví');
    }

    const amount = parseVndAmount(dto.amount);
    assertVndAmountRange(amount);
    const needsApproval = this.requiresApproval(admin.role, amount);
    if (admin.role === UserRole.ACCOUNTANT) {
      await this.assertAccountantDailyLimit(admin.id, amount);
    }

    const record = await this.prisma.agentManualCredit.create({
      data: {
        agentId,
        type: AgentManualCreditType.CREDIT,
        amount,
        category: dto.category,
        reason: dto.reason.trim(),
        referenceCode: dto.referenceCode?.trim() || null,
        status: AgentManualCreditStatus.PENDING_APPROVAL,
        requestedById: admin.id,
        requestedByEmail: admin.email,
        requestedRole: admin.role ?? UserRole.ADMIN,
      },
    });

    if (needsApproval) {
      this.auditLog.create({
        resource: SystemAuditResource.PRICING,
        action: SystemAuditAction.CREATE,
        resourceId: record.id,
        resourceName: `Yêu cầu nạp ví ${agent.companyName}`,
        fieldName: 'agent_manual_credit',
        newValue: { amount: amount.toFixed(2), status: 'PENDING_APPROVAL' },
        performedBy: admin.id,
        performedEmail: admin.email,
        performedRole: admin.role ?? UserRole.ADMIN,
        reason: dto.reason,
      });
      return { ...this.mapManualCredit(record), balance: null, message: 'Đã gửi yêu cầu chờ duyệt' };
    }

    const result = await this.executeManualCredit(record.id, admin);
    return result;
  }

  async approveManualCredit(
    agentId: string,
    creditId: string,
    admin: { id: string; email: string; role?: UserRole },
  ) {
    this.assertApproverRole(admin.role);
    const record = await this.requirePendingCredit(agentId, creditId);
    if (record.requestedById === admin.id && admin.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Không thể tự duyệt yêu cầu của chính mình');
    }

    await this.prisma.agentManualCredit.update({
      where: { id: creditId },
      data: {
        approvedById: admin.id,
        approvedByEmail: admin.email,
        approvedAt: new Date(),
      },
    });

    return this.executeManualCredit(creditId, admin);
  }

  async rejectManualCredit(
    agentId: string,
    creditId: string,
    admin: { id: string; email: string; role?: UserRole },
    reason: string,
  ) {
    this.assertApproverRole(admin.role);
    const record = await this.requirePendingCredit(agentId, creditId);

    const updated = await this.prisma.agentManualCredit.update({
      where: { id: creditId },
      data: {
        status: AgentManualCreditStatus.REJECTED,
        rejectedReason: reason.trim(),
        approvedById: admin.id,
        approvedByEmail: admin.email,
        approvedAt: new Date(),
      },
    });

    this.auditLog.create({
      resource: SystemAuditResource.PRICING,
      action: SystemAuditAction.UPDATE,
      resourceId: creditId,
      fieldName: 'status',
      oldValue: AgentManualCreditStatus.PENDING_APPROVAL,
      newValue: AgentManualCreditStatus.REJECTED,
      performedBy: admin.id,
      performedEmail: admin.email,
      performedRole: admin.role ?? UserRole.ADMIN,
      reason,
    });

    return this.mapManualCredit(updated);
  }

  async createManualDebit(
    agentId: string,
    dto: CreateAgentManualDebitDto,
    admin: { id: string; email: string; role?: UserRole },
  ) {
    if (admin.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Chỉ SUPER_ADMIN được trừ ví thủ công');
    }
    const agent = await this.requireAgent(agentId);
    if (agent.status !== AgentStatus.ACTIVE) {
      throw new BadRequestException('Đại lý phải ACTIVE');
    }

    const amount = parseVndAmount(dto.amount);
    assertVndAmountRange(amount);
    const referenceId = randomUUID();
    const description = this.buildDescription(dto.category, dto.reason, dto.referenceCode ?? null);

    const entry = await this.ledgerService.debitFromAvailable(
      agent.id,
      amount,
      LedgerReferenceType.ADJUSTMENT,
      referenceId,
      admin.id,
      description,
    );

    const record = await this.prisma.agentManualCredit.create({
      data: {
        agentId,
        type: AgentManualCreditType.DEBIT,
        amount,
        category: dto.category,
        reason: dto.reason.trim(),
        referenceCode: dto.referenceCode?.trim() || null,
        status: AgentManualCreditStatus.COMPLETED,
        ledgerEntryId: entry.id,
        requestedById: admin.id,
        requestedByEmail: admin.email,
        requestedRole: admin.role ?? UserRole.SUPER_ADMIN,
        approvedById: admin.id,
        approvedByEmail: admin.email,
        approvedAt: new Date(),
        completedAt: new Date(),
      },
    });

    this.auditLog.create({
      resource: SystemAuditResource.PRICING,
      action: SystemAuditAction.CREATE,
      resourceId: record.id,
      resourceName: `Trừ ví ${agent.companyName}`,
      fieldName: 'agent_manual_debit',
      newValue: { amount: amount.toFixed(2) },
      performedBy: admin.id,
      performedEmail: admin.email,
      performedRole: UserRole.SUPER_ADMIN,
      reason: dto.reason,
    });

    const balance = await this.ledgerService.getBalance(agent.id);
    return { ...this.mapManualCredit(record), balance, ledgerEntryId: entry.id };
  }

  async createDepositOnBehalf(
    agentId: string,
    dto: CreateAgentDepositOnBehalfDto,
    admin: { id: string; email: string },
  ) {
    const agent = await this.requireAgent(agentId);
    const amount = parseVndAmount(dto.amount);
    assertVndAmountRange(amount);
    const idempotencyKey = `admin-${admin.id}-${randomUUID()}`;
    const deposit = await this.depositService.createDeposit(
      agent.userId,
      amount.toNumber(),
      idempotencyKey,
      dto.gateway,
      admin.email,
    );

    this.auditLog.create({
      resource: SystemAuditResource.PRICING,
      action: SystemAuditAction.CREATE,
      resourceId: deposit.id,
      resourceName: `Tạo nạp cổng hộ ${agent.companyName}`,
      fieldName: 'agent_deposit',
      newValue: { amount: amount.toFixed(2), gateway: deposit.gateway },
      performedBy: admin.id,
      performedEmail: admin.email,
      performedRole: UserRole.ADMIN,
      reason: 'Admin tạo yêu cầu nạp cổng',
    });

    return deposit;
  }

  private async executeManualCredit(
    creditId: string,
    admin: { id: string; email: string; role?: UserRole },
  ) {
    const record = await this.prisma.agentManualCredit.findFirst({
      where: { id: creditId, deletedAt: null },
    });
    if (!record || record.type !== AgentManualCreditType.CREDIT) {
      throw new NotFoundException('Yêu cầu nạp không tồn tại');
    }
    if (record.status === AgentManualCreditStatus.COMPLETED) {
      const balance = await this.ledgerService.getBalance(record.agentId);
      return { ...this.mapManualCredit(record), balance, ledgerEntryId: record.ledgerEntryId };
    }
    if (record.status !== AgentManualCreditStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Yêu cầu không thể thực hiện');
    }

    const referenceId = randomUUID();
    const description = this.buildDescription(
      record.category,
      record.reason,
      record.referenceCode,
    );

    const entry = await this.ledgerService.credit(
      record.agentId,
      record.amount,
      LedgerReferenceType.TOPUP,
      referenceId,
      record.requestedById,
      description,
    );

    await this.agentAudit.recordCredited(record.requestedById, record.agentId, {
      amount: record.amount.toFixed(2),
      referenceId,
    });

    const updated = await this.prisma.agentManualCredit.update({
      where: { id: creditId },
      data: {
        status: AgentManualCreditStatus.COMPLETED,
        ledgerEntryId: entry.id,
        completedAt: new Date(),
        approvedById: admin.id,
        approvedByEmail: admin.email,
        approvedAt: new Date(),
      },
    });

    this.auditLog.create({
      resource: SystemAuditResource.PRICING,
      action: SystemAuditAction.UPDATE,
      resourceId: creditId,
      fieldName: 'status',
      oldValue: AgentManualCreditStatus.PENDING_APPROVAL,
      newValue: AgentManualCreditStatus.COMPLETED,
      performedBy: admin.id,
      performedEmail: admin.email,
      performedRole: admin.role ?? UserRole.ADMIN,
      reason: 'Duyệt nạp ví đại lý',
    });

    const balance = await this.ledgerService.getBalance(record.agentId);
    return { ...this.mapManualCredit(updated), balance, ledgerEntryId: entry.id };
  }

  private buildDescription(
    category: AgentManualCreditCategory,
    reason: string,
    referenceCode: string | null,
  ) {
    const parts = [`[${CATEGORY_LABELS[category]}]`, reason.trim()];
    if (referenceCode?.trim()) parts.push(`Ref: ${referenceCode.trim()}`);
    return parts.join(' — ');
  }

  private requiresApproval(role: UserRole | undefined, amount: Decimal) {
    if (role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN) return false;
    if (role === UserRole.ACCOUNTANT) return amount.gt(WALLET_APPROVAL_THRESHOLD);
    return true;
  }

  private async assertAccountantDailyLimit(adminId: string, amount: Decimal) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const sum = await this.prisma.agentManualCredit.aggregate({
      where: {
        requestedById: adminId,
        type: AgentManualCreditType.CREDIT,
        status: AgentManualCreditStatus.COMPLETED,
        deletedAt: null,
        completedAt: { gte: start },
      },
      _sum: { amount: true },
    });
    const used = sum._sum.amount ?? new Decimal(0);
    if (used.add(amount).gt(WALLET_ACCOUNTANT_DAILY_LIMIT)) {
      throw new BadRequestException(
        `Vượt hạn mức nạp ngày (${WALLET_ACCOUNTANT_DAILY_LIMIT.toLocaleString('vi-VN')} đ)`,
      );
    }
  }

  private assertCreditRole(role?: UserRole) {
    if (
      role !== UserRole.ADMIN &&
      role !== UserRole.ACCOUNTANT &&
      role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Không có quyền nạp ví');
    }
  }

  private assertApproverRole(role?: UserRole) {
    if (role !== UserRole.ADMIN && role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Chỉ ADMIN/SUPER_ADMIN được duyệt yêu cầu nạp');
    }
  }

  private async requirePendingCredit(agentId: string, creditId: string) {
    const record = await this.prisma.agentManualCredit.findFirst({
      where: {
        id: creditId,
        agentId,
        status: AgentManualCreditStatus.PENDING_APPROVAL,
        deletedAt: null,
      },
    });
    if (!record) throw new NotFoundException('Yêu cầu chờ duyệt không tồn tại');
    return record;
  }

  private async requireAgent(agentId: string) {
    const agent = await this.prisma.agent.findFirst({ where: { id: agentId, deletedAt: null } });
    if (!agent) throw new NotFoundException('Agent not found');
    return agent;
  }

  private mapManualCredit(record: {
    id: string;
    type: AgentManualCreditType;
    amount: Decimal;
    category: AgentManualCreditCategory;
    reason: string;
    referenceCode: string | null;
    status: AgentManualCreditStatus;
    ledgerEntryId: string | null;
    requestedByEmail: string;
    requestedRole: UserRole;
    approvedByEmail: string | null;
    rejectedReason: string | null;
    createdAt: Date;
    approvedAt: Date | null;
    completedAt: Date | null;
  }) {
    return {
      id: record.id,
      type: record.type,
      amount: record.amount.toFixed(2),
      category: record.category,
      categoryLabel: CATEGORY_LABELS[record.category],
      reason: record.reason,
      referenceCode: record.referenceCode,
      status: record.status,
      ledgerEntryId: record.ledgerEntryId,
      requestedByEmail: record.requestedByEmail,
      requestedRole: record.requestedRole,
      approvedByEmail: record.approvedByEmail,
      rejectedReason: record.rejectedReason,
      createdAt: record.createdAt.toISOString(),
      approvedAt: record.approvedAt?.toISOString() ?? null,
      completedAt: record.completedAt?.toISOString() ?? null,
    };
  }
}
