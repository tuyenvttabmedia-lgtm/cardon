import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AgentKycStatus,
  AgentMemberStatus,
  AgentStatus,
  FulfillmentStatus,
  InvoiceType,
  LedgerEntryType,
  OrderChannel,
  OrderPaymentStatus,
  Prisma,
  ProviderProductMappingStatus,
  SystemAuditAction,
  SystemAuditResource,
  UserRole,
  WebhookSource,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../database/prisma.service';
import { mapAdminAgent } from '../../admin/entities/admin-agent.mapper';
import { resolveAdminPagination } from '../../admin/utils/admin-pagination.util';
import {
  AGENT_ROLE_PERMISSIONS,
  AgentPlatformRole,
} from '../../agent-platform/entities/agent-platform.constants';
import { AGENT_API_KEY_PREFIX } from '../../agent/entities/agent.constants';
import type { AgentIpWhitelistEntry } from '../../agent-security-center/entities/agent-security.constants';
import {
  AdminAgentCenterListQueryDto,
  AdminAgentCenterMetaDto,
  AdminAgentCenterOnboardingQueryDto,
  AdminAgentCenterSearchQueryDto,
  AdminAgentCenterStatementQueryDto,
  AdminAgentCenterTabQueryDto,
  OnboardingQueueTab,
} from '../dto/admin-agent-center.dto';
import { UpdateAgentMarginConfigDto } from '../dto/admin-agent-margin.dto';
import { PricingService } from '../../product/services/pricing.service';
import { AgentMarginConfigService } from '../../product/services/agent-margin-config.service';
import {
  AGENT_MARGIN_SETTINGS_KEY,
  DEFAULT_AGENT_MARGIN_CONFIG,
  PRODUCT_GROUP_LABELS,
} from '../../product/entities/agent-margin.constants';
import { ACTIVE_VARIANT_WHERE } from '../../product/entities/product.constants';

const AGENT_TAGS = ['VIP', 'Enterprise', 'Priority', 'Risk', 'Manual Review'] as const;

type AdminCenterMeta = {
  tags?: string[];
  notes?: Array<{
    id: string;
    text: string;
    adminId: string;
    adminEmail: string;
    createdAt: string;
  }>;
};

@Injectable()
export class AdminAgentCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: PricingService,
    private readonly marginConfig: AgentMarginConfigService,
  ) {}

  async getDashboard() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      total,
      active,
      pendingKyc,
      suspended,
      kycQueue,
      registeredToday,
      apiEnabledCount,
      pendingReview,
      needMoreInfo,
      approvedToday,
      rejectedToday,
    ] = await Promise.all([
      this.prisma.agent.count({ where: { deletedAt: null } }),
      this.prisma.agent.count({ where: { deletedAt: null, status: AgentStatus.ACTIVE } }),
      this.prisma.agent.count({ where: { deletedAt: null, status: AgentStatus.PENDING_KYC } }),
      this.prisma.agent.count({ where: { deletedAt: null, status: AgentStatus.SUSPENDED } }),
      this.prisma.agentKyc.count({
        where: { status: { in: [AgentKycStatus.SUBMITTED, AgentKycStatus.PENDING] } },
      }),
      this.prisma.agent.count({ where: { deletedAt: null, createdAt: { gte: todayStart } } }),
      this.prisma.agent.count({ where: { deletedAt: null, apiEnabled: true } }),
      this.prisma.agentKyc.count({ where: { status: AgentKycStatus.SUBMITTED } }),
      this.prisma.agentKyc.count({ where: { status: AgentKycStatus.NEED_MORE_INFO } }),
      this.prisma.agentKyc.count({
        where: { status: AgentKycStatus.APPROVED, reviewedAt: { gte: todayStart } },
      }),
      this.prisma.agentKyc.count({
        where: { status: AgentKycStatus.REJECTED, reviewedAt: { gte: todayStart } },
      }),
    ]);

    return {
      total,
      active,
      pendingKyc,
      suspended,
      kycQueue,
      registeredToday,
      apiEnabledCount,
      pendingReview,
      needMoreInfo,
      approvedToday,
      rejectedToday,
    };
  }

  async listAgents(query: AdminAgentCenterListQueryDto) {
    const pagination = resolveAdminPagination(query.skip, query.take);
    const where = await this.buildListWhere(query);
    const orderBy = this.buildListOrder(query);

    const [rows, total] = await Promise.all([
      this.prisma.agent.findMany({
        where,
        include: {
          kyc: { select: { status: true, taxCode: true } },
          user: { select: { id: true, email: true, phone: true } },
          webhookConfig: { select: { enabled: true, callbackUrl: true } },
          _count: { select: { members: true, orders: true } },
        },
        orderBy,
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.agent.count({ where }),
    ]);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const items = await Promise.all(
      rows.map(async (agent) => {
        const todayOrders = await this.prisma.order.count({
          where: {
            agentId: agent.id,
            channel: OrderChannel.AGENT,
            deletedAt: null,
            createdAt: { gte: todayStart },
          },
        });
        const lastActivity = await this.resolveLastActivity(agent.id, agent.lastUsedAt);
        const meta = this.parseAdminMeta(agent.securityConfig);

        return {
          id: agent.id,
          agentCode: this.formatAgentCode(agent.id),
          companyName: agent.companyName,
          businessType: 'B2B',
          status: agent.status,
          kycStatus: agent.kyc?.status ?? null,
          walletBalance: agent.balance.toFixed(2),
          heldBalance: agent.heldBalance.toFixed(2),
          todayOrders,
          apiStatus: agent.apiEnabled ? 'ENABLED' : 'DISABLED',
          webhookStatus: agent.webhookConfig?.enabled ? 'ENABLED' : 'DISABLED',
          memberCount: agent._count.members,
          createdAt: agent.createdAt.toISOString(),
          lastActivityAt: lastActivity,
          contactEmail: agent.contactEmail,
          userEmail: agent.user?.email ?? null,
          taxCode: agent.kyc?.taxCode ?? null,
          tags: meta.tags ?? [],
        };
      }),
    );

    return { items, total, skip: pagination.skip, take: pagination.take };
  }

  async searchAgents(query: AdminAgentCenterSearchQueryDto) {
    const limit = query.limit ?? 20;
    const list = await this.listAgents({ q: query.q, take: limit, skip: 0 });
    return list.items;
  }

  async getKycQueue(query: AdminAgentCenterTabQueryDto) {
    return this.listAgents({
      kycStatus: AgentKycStatus.SUBMITTED,
      skip: query.skip,
      take: query.take,
      sort: 'createdAt',
      order: 'desc',
    });
  }

  async getOnboardingQueue(query: AdminAgentCenterOnboardingQueryDto) {
    const pagination = resolveAdminPagination(query.skip, query.take);
    const tab: OnboardingQueueTab = query.tab ?? 'submitted';

    if (tab === 'email_pending') {
      return this.listEmailPendingOnboarding(pagination.skip, pagination.take);
    }

    const kycStatusMap: Partial<Record<OnboardingQueueTab, AgentKycStatus>> = {
      submitted: AgentKycStatus.SUBMITTED,
      need_more_info: AgentKycStatus.NEED_MORE_INFO,
      approved: AgentKycStatus.APPROVED,
      rejected: AgentKycStatus.REJECTED,
    };

    if (tab === 'kyc_pending') {
      const where: Prisma.AgentWhereInput = {
        deletedAt: null,
        user: { emailVerifiedAt: { not: null }, role: UserRole.AGENT },
        OR: [{ kyc: null }, { kyc: { status: AgentKycStatus.PENDING } }],
      };
      return this.listOnboardingAgents(where, pagination.skip, pagination.take);
    }

    const kycStatus = kycStatusMap[tab];
    if (!kycStatus) {
      throw new BadRequestException('Invalid onboarding tab');
    }

    return this.listOnboardingAgents(
      { deletedAt: null, kyc: { status: kycStatus } },
      pagination.skip,
      pagination.take,
    );
  }

  async getAgentOnboarding(agentId: string) {
    const agent = await this.requireAgent(agentId);
    const security = this.parseSecurityConfig(agent.securityConfig);
    const onboardingMeta = security.onboarding as Record<string, unknown> | undefined;
    const meta = this.parseAdminMeta(agent.securityConfig);

    return {
      agentId: agent.id,
      agentCode: this.formatAgentCode(agent.id),
      companyName: agent.companyName,
      status: agent.status,
      createdAt: agent.createdAt.toISOString(),
      user: {
        id: agent.user?.id ?? null,
        email: agent.user?.email ?? null,
        phone: agent.user?.phone ?? null,
        fullName: agent.user?.fullName ?? null,
        emailVerified: agent.user?.emailVerifiedAt != null,
        emailVerifiedAt: agent.user?.emailVerifiedAt?.toISOString() ?? null,
      },
      registration: {
        accountType: onboardingMeta?.accountType ?? agent.kyc?.accountType ?? null,
        source: onboardingMeta?.source ?? null,
        registeredAt: onboardingMeta?.registeredAt ?? agent.createdAt.toISOString(),
      },
      kyc: agent.kyc
        ? {
            status: agent.kyc.status,
            accountType: agent.kyc.accountType,
            profile: agent.kyc.profile,
            documents: agent.kyc.documents,
            businessProfile: agent.kyc.businessProfile,
            reviewNote: agent.kyc.reviewNote,
            requestedFields: agent.kyc.requestedFields,
            reviewedAt: agent.kyc.reviewedAt?.toISOString() ?? null,
            legacy: {
              companyName: agent.kyc.companyName,
              taxCode: agent.kyc.taxCode,
              representativeName: agent.kyc.representativeName,
              documentFront: agent.kyc.documentFront,
              documentBack: agent.kyc.documentBack,
              businessLicense: agent.kyc.businessLicense,
            },
          }
        : null,
      tags: meta.tags ?? [],
      notes: meta.notes ?? [],
    };
  }

  private async listEmailPendingOnboarding(skip: number, take: number) {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      role: UserRole.AGENT,
      emailVerifiedAt: null,
      agent: { is: { deletedAt: null } },
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: {
          agent: {
            include: { kyc: { select: { status: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.user.count({ where }),
    ]);

    const items = users.map((user) => {
      const agent = user.agent;
      const security = this.parseSecurityConfig(agent?.securityConfig);
      const onboarding = security.onboarding as Record<string, unknown> | undefined;
      return {
        id: agent?.id ?? user.id,
        agentCode: agent ? this.formatAgentCode(agent.id) : '—',
        companyName: agent?.companyName ?? '—',
        businessType: 'B2B',
        status: agent?.status ?? AgentStatus.PENDING_KYC,
        kycStatus: agent?.kyc?.status ?? null,
        emailVerified: false,
        userEmail: user.email,
        accountType: onboarding?.accountType ?? null,
        createdAt: (agent?.createdAt ?? user.createdAt).toISOString(),
        onboardingTab: 'email_pending' as const,
      };
    });

    return { items, total, skip, take };
  }

  private async listOnboardingAgents(
    where: Prisma.AgentWhereInput,
    skip: number,
    take: number,
  ) {
    const [rows, total] = await Promise.all([
      this.prisma.agent.findMany({
        where,
        include: {
          kyc: { select: { status: true, accountType: true } },
          user: { select: { email: true, emailVerifiedAt: true, phone: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.agent.count({ where }),
    ]);

    const items = rows.map((agent) => {
      const security = this.parseSecurityConfig(agent.securityConfig);
      const onboarding = security.onboarding as Record<string, unknown> | undefined;
      return {
        id: agent.id,
        agentCode: this.formatAgentCode(agent.id),
        companyName: agent.companyName,
        businessType: 'B2B',
        status: agent.status,
        kycStatus: agent.kyc?.status ?? null,
        emailVerified: agent.user?.emailVerifiedAt != null,
        userEmail: agent.user?.email ?? null,
        accountType: agent.kyc?.accountType ?? onboarding?.accountType ?? null,
        createdAt: agent.createdAt.toISOString(),
      };
    });

    return { items, total, skip, take };
  }

  async getOverview(agentId: string) {
    const agent = await this.requireAgent(agentId);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

    const [
      todayOrders,
      monthOrders,
      successOrders,
      monthTotalOrders,
      apiCallsToday,
      members,
      latestLogin,
      latestActivity,
      webhookConfig,
    ] = await Promise.all([
      this.prisma.order.count({
        where: { agentId, channel: OrderChannel.AGENT, deletedAt: null, createdAt: { gte: todayStart } },
      }),
      this.prisma.order.aggregate({
        where: {
          agentId,
          channel: OrderChannel.AGENT,
          deletedAt: null,
          createdAt: { gte: monthStart },
          paymentStatus: OrderPaymentStatus.PAID,
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.order.count({
        where: {
          agentId,
          channel: OrderChannel.AGENT,
          deletedAt: null,
          createdAt: { gte: monthStart },
          fulfillmentStatus: FulfillmentStatus.COMPLETED,
        },
      }),
      this.prisma.order.count({
        where: { agentId, channel: OrderChannel.AGENT, deletedAt: null, createdAt: { gte: monthStart } },
      }),
      this.prisma.agentApiRequestLog.count({
        where: { agentId, requestTime: { gte: todayStart } },
      }),
      this.prisma.agentMember.count({ where: { agentId, status: AgentMemberStatus.ACTIVE } }),
      this.prisma.agentLoginHistory.findFirst({
        where: { agentId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.systemActivityLog.findFirst({
        where: {
          OR: [
            { resourceId: agentId },
            { metadata: { path: ['agentId'], equals: agentId } },
          ],
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.agentWebhookConfig.findUnique({ where: { agentId } }),
    ]);

    const monthRevenue = monthOrders._sum.totalAmount?.toFixed(2) ?? '0.00';
    const successRate =
      monthTotalOrders > 0 ? Math.round((successOrders / monthTotalOrders) * 100) : 100;
    const meta = this.parseAdminMeta(agent.securityConfig);

    return {
      agent: mapAdminAgent(agent),
      cards: {
        walletBalance: agent.balance.toFixed(2),
        heldBalance: agent.heldBalance.toFixed(2),
        availableBalance: agent.balance.sub(agent.heldBalance).toFixed(2),
        todayOrders,
        monthRevenue,
        successRate,
        apiCallsToday,
        webhookStatus: webhookConfig?.enabled ? 'ENABLED' : 'DISABLED',
        memberCount: members,
        kycStatus: agent.kyc?.status ?? null,
      },
      latestActivity: latestActivity
        ? {
            title: latestActivity.title,
            at: latestActivity.createdAt.toISOString(),
            severity: latestActivity.severity,
          }
        : null,
      latestLogin: latestLogin
        ? {
            at: latestLogin.createdAt.toISOString(),
            ipAddress: latestLogin.ipAddress,
            device: latestLogin.device,
            browser: latestLogin.browser,
            country: latestLogin.country,
          }
        : null,
      tags: meta.tags ?? [],
      notes: meta.notes ?? [],
    };
  }

  async getInformation(agentId: string) {
    const agent = await this.requireAgent(agentId);
    const meta = this.parseAdminMeta(agent.securityConfig);
    return {
      companyName: agent.companyName,
      contactEmail: agent.contactEmail,
      userEmail: agent.user?.email ?? null,
      userPhone: agent.user?.phone ?? null,
      emailVerified: agent.user?.emailVerifiedAt != null,
      emailVerifiedAt: agent.user?.emailVerifiedAt?.toISOString() ?? null,
      status: agent.status,
      createdAt: agent.createdAt.toISOString(),
      kyc: agent.kyc
        ? {
            status: agent.kyc.status,
            accountType: agent.kyc.accountType,
            profile: agent.kyc.profile,
            documents: agent.kyc.documents,
            businessProfile: agent.kyc.businessProfile,
            reviewNote: agent.kyc.reviewNote,
            requestedFields: agent.kyc.requestedFields,
            taxCode: agent.kyc.taxCode,
            representativeName: agent.kyc.representativeName,
            companyName: agent.kyc.companyName,
            reviewedAt: agent.kyc.reviewedAt?.toISOString() ?? null,
            documentFront: agent.kyc.documentFront,
            documentBack: agent.kyc.documentBack,
            businessLicense: agent.kyc.businessLicense,
          }
        : null,
      tags: meta.tags ?? [],
      notes: meta.notes ?? [],
    };
  }

  async getWallet(agentId: string, query: AdminAgentCenterTabQueryDto) {
    const agent = await this.requireAgent(agentId);
    const pagination = resolveAdminPagination(query.skip, query.take ?? 20);

    const [ledger, deposits, totalLedger] = await Promise.all([
      this.prisma.ledgerEntry.findMany({
        where: { agentId },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.agentDeposit.findMany({
        where: { agentId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.ledgerEntry.count({ where: { agentId } }),
    ]);

    return {
      balance: agent.balance.toFixed(2),
      heldAmount: agent.heldBalance.toFixed(2),
      available: agent.balance.sub(agent.heldBalance).toFixed(2),
      deposits: deposits.map((d) => ({
        id: d.id,
        amount: d.amount.toFixed(2),
        status: d.status,
        gateway: d.gateway,
        createdAt: d.createdAt.toISOString(),
        creditedAt: d.creditedAt?.toISOString() ?? null,
      })),
      ledger: ledger.map((e) => ({
        id: e.id,
        type: e.type,
        amount: e.amount.toFixed(2),
        referenceType: e.referenceType,
        referenceId: e.referenceId,
        createdAt: e.createdAt.toISOString(),
        afterBalance: e.afterBalance.toFixed(2),
      })),
      totalLedger,
      skip: pagination.skip,
      take: pagination.take,
    };
  }

  async getApi(agentId: string) {
    const agent = await this.requireAgent(agentId);
    const config = this.parseSecurityConfig(agent.securityConfig) as { ipWhitelist?: AgentIpWhitelistEntry[] };
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [logs, totalCalls, errorCalls, lastLog] = await Promise.all([
      this.prisma.agentApiRequestLog.findMany({
        where: { agentId },
        orderBy: { requestTime: 'desc' },
        take: 10,
      }),
      this.prisma.agentApiRequestLog.count({
        where: { agentId, requestTime: { gte: since } },
      }),
      this.prisma.agentApiRequestLog.count({
        where: { agentId, requestTime: { gte: since }, httpStatus: { gte: 400 } },
      }),
      this.prisma.agentApiRequestLog.findFirst({
        where: { agentId },
        orderBy: { requestTime: 'desc' },
      }),
    ]);

    return {
      apiEnabled: agent.apiEnabled,
      hasCredentials: Boolean(agent.apiKeyHash),
      apiKeyMasked: agent.apiKeyHash
        ? `${AGENT_API_KEY_PREFIX}${'•'.repeat(24)}`
        : null,
      rateLimit: agent.rateLimit,
      lastUsedAt: agent.lastUsedAt?.toISOString() ?? null,
      ipWhitelist: (config.ipWhitelist ?? []).map((e) => ({
        id: e.id,
        cidr: e.cidr,
        description: e.description,
        enabled: e.enabled,
        status: e.status ?? 'APPROVED',
        createdAt: e.createdAt,
        reviewedAt: e.reviewedAt ?? null,
        reviewedBy: e.reviewedBy ?? null,
      })),
      usage24h: {
        total: totalCalls,
        errors: errorCalls,
      },
      recentLogs: logs.map((l) => ({
        id: l.id,
        endpoint: l.endpoint,
        method: l.method,
        httpStatus: l.httpStatus,
        latencyMs: l.latencyMs,
        requestTime: l.requestTime.toISOString(),
      })),
      lastApiCall: lastLog
        ? {
            endpoint: lastLog.endpoint,
            at: lastLog.requestTime.toISOString(),
            httpStatus: lastLog.httpStatus,
          }
        : null,
    };
  }

  async approveIpWhitelistEntry(
    agentId: string,
    entryId: string,
    adminId: string,
    adminEmail: string,
  ) {
    return this.setIpWhitelistReviewStatus(agentId, entryId, 'APPROVED', adminId, adminEmail);
  }

  async rejectIpWhitelistEntry(
    agentId: string,
    entryId: string,
    adminId: string,
    adminEmail: string,
  ) {
    return this.setIpWhitelistReviewStatus(agentId, entryId, 'REJECTED', adminId, adminEmail);
  }

  private async setIpWhitelistReviewStatus(
    agentId: string,
    entryId: string,
    status: 'APPROVED' | 'REJECTED',
    adminId: string,
    adminEmail: string,
  ) {
    const agent = await this.requireAgent(agentId);
    const config = this.parseSecurityConfig(agent.securityConfig) as {
      ipWhitelist?: AgentIpWhitelistEntry[];
    };
    const list = config.ipWhitelist ?? [];
    const idx = list.findIndex((e) => e.id === entryId);
    if (idx < 0) {
      throw new NotFoundException('IP whitelist entry not found');
    }
    const now = new Date().toISOString();
    const updated: AgentIpWhitelistEntry = {
      ...list[idx],
      status,
      enabled: status === 'APPROVED',
      reviewedAt: now,
      reviewedBy: adminEmail || adminId,
    };
    const ipWhitelist = list.map((e, i) => (i === idx ? updated : e));
    await this.prisma.agent.update({
      where: { id: agentId },
      data: {
        securityConfig: {
          ...config,
          ipWhitelist,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    return updated;
  }

  async getWebhooks(agentId: string, query: AdminAgentCenterTabQueryDto) {
    await this.requireAgent(agentId);
    const config = await this.prisma.agentWebhookConfig.findUnique({ where: { agentId } });
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const pagination = resolveAdminPagination(query.skip, query.take ?? 20);

    const deliveries = await this.prisma.webhookLog.findMany({
      where: {
        source: WebhookSource.PARTNER,
        createdAt: { gte: since },
        monitorMetadata: { path: ['agentId'], equals: agentId },
      },
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    });

    const statsRows = await this.prisma.webhookLog.findMany({
      where: {
        source: WebhookSource.PARTNER,
        createdAt: { gte: since },
        monitorMetadata: { path: ['agentId'], equals: agentId },
      },
      select: { processed: true, retryCount: true, cancelledAt: true },
    });

    const total = statsRows.length;
    const delivered = statsRows.filter((r) => r.processed && !r.cancelledAt).length;
    const failed = statsRows.filter((r) => !r.processed && (r.retryCount ?? 0) >= 3).length;
    const pending = statsRows.filter((r) => !r.processed && !r.cancelledAt).length;

    return {
      callbackUrl: config?.callbackUrl ?? null,
      enabled: config?.enabled ?? false,
      secretConfigured: Boolean(config?.secretEncrypted),
      deliveryRate: total > 0 ? Math.round((delivered / total) * 100) : 100,
      stats: { total, delivered, failed, pending, retry: statsRows.reduce((s, r) => s + (r.retryCount ?? 0), 0) },
      deliveries: deliveries.map((d) => ({
        id: d.id,
        processed: d.processed,
        retryCount: d.retryCount,
        createdAt: d.createdAt.toISOString(),
        signatureValid: d.signatureValid,
      })),
    };
  }

  async getMembers(agentId: string) {
    await this.requireAgent(agentId);
    const members = await this.prisma.agentMember.findMany({
      where: { agentId },
      include: {
        user: { select: { id: true, email: true, phone: true, fullName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      items: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        email: m.user.email,
        fullName: m.user.fullName ?? m.displayName,
        role: m.role,
        status: m.status,
        lastLoginAt: m.lastLoginAt?.toISOString() ?? null,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  async getRoles() {
    return {
      roles: Object.keys(AGENT_ROLE_PERMISSIONS).map((role) => ({
        role,
        permissions: AGENT_ROLE_PERMISSIONS[role as AgentPlatformRole],
      })),
    };
  }

  async getOrders(agentId: string, query: AdminAgentCenterTabQueryDto) {
    await this.requireAgent(agentId);
    const pagination = resolveAdminPagination(query.skip, query.take ?? 20);

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where: { agentId, channel: OrderChannel.AGENT, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
        select: {
          id: true,
          orderCode: true,
          totalAmount: true,
          paymentStatus: true,
          fulfillmentStatus: true,
          agentRequestId: true,
          createdAt: true,
        },
      }),
      this.prisma.order.count({
        where: { agentId, channel: OrderChannel.AGENT, deletedAt: null },
      }),
    ]);

    return {
      items: orders.map((o) => ({
        id: o.id,
        orderCode: o.orderCode,
        requestId: o.agentRequestId,
        amount: o.totalAmount.toFixed(2),
        paymentStatus: o.paymentStatus,
        fulfillmentStatus: o.fulfillmentStatus,
        createdAt: o.createdAt.toISOString(),
      })),
      total,
      skip: pagination.skip,
      take: pagination.take,
    };
  }

  async getActivity(agentId: string, query: AdminAgentCenterTabQueryDto) {
    await this.requireAgent(agentId);
    const pagination = resolveAdminPagination(query.skip, query.take ?? 30);

    const where: Prisma.SystemActivityLogWhereInput = {
      OR: [
        { resourceId: agentId },
        { metadata: { path: ['agentId'], equals: agentId } },
      ],
    };

    const [items, total] = await Promise.all([
      this.prisma.systemActivityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.systemActivityLog.count({ where }),
    ]);

    return {
      items: items.map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description,
        severity: a.severity,
        eventCategory: a.eventCategory,
        createdAt: a.createdAt.toISOString(),
        performedEmail: a.performedEmail,
      })),
      total,
      skip: pagination.skip,
      take: pagination.take,
    };
  }

  async getLoginHistory(agentId: string, query: AdminAgentCenterTabQueryDto) {
    await this.requireAgent(agentId);
    const pagination = resolveAdminPagination(query.skip, query.take ?? 30);

    const where = { agentId };
    const [items, total] = await Promise.all([
      this.prisma.agentLoginHistory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.agentLoginHistory.count({ where }),
    ]);

    return {
      items: items.map((r) => ({
        id: r.id,
        ipAddress: r.ipAddress,
        device: r.device,
        browser: r.browser,
        country: r.country,
        result: r.result,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      skip: pagination.skip,
      take: pagination.take,
    };
  }

  async getMarginConfig() {
    const [config, settingRow, lastAudit, sampleCosts] = await Promise.all([
      this.marginConfig.getConfig(),
      this.prisma.systemSetting.findUnique({ where: { key: AGENT_MARGIN_SETTINGS_KEY } }),
      this.prisma.systemAuditLog.findFirst({
        where: {
          resource: SystemAuditResource.PRICING,
          fieldName: AGENT_MARGIN_SETTINGS_KEY,
          action: SystemAuditAction.UPDATE,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.loadSampleProviderCostsByGroup(),
    ]);

    return {
      ...config,
      labels: PRODUCT_GROUP_LABELS,
      sampleCosts,
      defaults: DEFAULT_AGENT_MARGIN_CONFIG,
      lastUpdated: {
        at: (lastAudit?.createdAt ?? settingRow?.updatedAt)?.toISOString() ?? null,
        email: lastAudit?.performedEmail ?? null,
        role: lastAudit?.performedRole ?? null,
      },
    };
  }

  async updateMarginConfig(
    dto: UpdateAgentMarginConfigDto,
    adminId: string,
    adminEmail: string,
    adminRole?: string,
  ) {
    await this.marginConfig.updateConfig(
      { roundTo: dto.roundTo, services: dto.services },
      { id: adminId, email: adminEmail, role: adminRole as never },
      dto.reason,
    );
    return this.getMarginConfig();
  }

  private async loadSampleProviderCostsByGroup() {
    const groups = Object.keys(PRODUCT_GROUP_LABELS) as (keyof typeof PRODUCT_GROUP_LABELS)[];
    const entries = await Promise.all(
      groups.map(async (homeService) => {
        const row = await this.prisma.providerProductMapping.findFirst({
          where: {
            status: ProviderProductMappingStatus.ACTIVE,
            productVariant: {
              ...ACTIVE_VARIANT_WHERE,
              product: { homeService },
            },
          },
          orderBy: { providerCost: 'asc' },
          select: { providerCost: true },
        });
        return [homeService, row ? Number(row.providerCost) : null] as const;
      }),
    );
    return Object.fromEntries(entries);
  }

  async getPricing(agentId: string) {
    await this.requireAgent(agentId);
    const config = await this.marginConfig.getConfig();
    const variants = await this.prisma.productVariant.findMany({
      where: ACTIVE_VARIANT_WHERE,
      select: {
        id: true,
        sku: true,
        name: true,
        faceValue: true,
        product: { select: { name: true, homeService: true } },
      },
      orderBy: { sku: 'asc' },
      take: 500,
    });

    const items = await Promise.all(
      variants.map(async (v) => {
        const resolved = await this.pricingService.resolveAgentPrice(agentId, v.id);
        return {
          variantId: v.id,
          sku: v.sku,
          productName: v.product.name,
          variantName: v.name,
          faceValue: v.faceValue.toFixed(2),
          homeService: v.product.homeService,
          homeServiceLabel: PRODUCT_GROUP_LABELS[v.product.homeService],
          providerCost: resolved.providerCost,
          cardonMargin: resolved.cardonMargin,
          agentPrice: resolved.sellingPrice,
          ruleSource: resolved.ruleSource,
          appliedRule: resolved.appliedRule,
        };
      }),
    );

    return {
      config,
      formula:
        'Giá bán đại lý = Giá vốn nhà cung cấp + Biên lợi nhuận CardOn (theo % hoặc VNĐ, làm tròn 100đ)',
      items,
    };
  }

  async getStatement(agentId: string, query: AdminAgentCenterStatementQueryDto) {
    const agent = await this.requireAgent(agentId);
    const dateTo = query.dateTo ? new Date(query.dateTo) : new Date();
    const dateFrom = query.dateFrom
      ? new Date(query.dateFrom)
      : new Date(dateTo.getFullYear(), dateTo.getMonth(), 1);

    const entries = await this.prisma.ledgerEntry.findMany({
      where: { agentId, createdAt: { gte: dateFrom, lte: dateTo } },
      orderBy: { createdAt: 'asc' },
    });

    let credits = new Decimal(0);
    let debits = new Decimal(0);
    for (const e of entries) {
      if (e.type === LedgerEntryType.CREDIT) credits = credits.add(e.amount);
      if (e.type === LedgerEntryType.DEBIT) debits = debits.add(e.amount);
    }

    return {
      readOnly: true,
      period: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
      openingBalance: entries[0]?.beforeBalance.toFixed(2) ?? agent.balance.toFixed(2),
      closingBalance: entries.at(-1)?.afterBalance.toFixed(2) ?? agent.balance.toFixed(2),
      summary: {
        credits: credits.toFixed(2),
        debits: debits.toFixed(2),
        entryCount: entries.length,
      },
      entries: entries.map((e) => ({
        id: e.id,
        type: e.type,
        amount: e.amount.toFixed(2),
        createdAt: e.createdAt.toISOString(),
        referenceType: e.referenceType,
      })),
    };
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
      readOnly: true,
      items: items.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        totalAmount: inv.totalAmount.toFixed(2),
        issuedAt: inv.issuedAt?.toISOString() ?? null,
        pdfUrl: inv.pdfUrl,
        createdAt: inv.createdAt.toISOString(),
      })),
      total,
      skip: pagination.skip,
      take: pagination.take,
    };
  }

  async updateMeta(agentId: string, adminId: string, adminEmail: string, dto: AdminAgentCenterMetaDto) {
    const agent = await this.requireAgent(agentId);
    const config = this.parseSecurityConfig(agent.securityConfig);
    const meta = this.parseAdminMeta(agent.securityConfig);

    if (dto.tags) {
      const invalid = dto.tags.filter((t) => !AGENT_TAGS.includes(t as (typeof AGENT_TAGS)[number]));
      if (invalid.length) {
        throw new BadRequestException(`Invalid tags: ${invalid.join(', ')}`);
      }
      meta.tags = dto.tags;
    }

    if (dto.note?.trim()) {
      meta.notes = [
        {
          id: randomUUID(),
          text: dto.note.trim(),
          adminId,
          adminEmail,
          createdAt: new Date().toISOString(),
        },
        ...(meta.notes ?? []),
      ].slice(0, 100);
    }

    const nextConfig = { ...config, adminCenter: meta };
    await this.prisma.agent.update({
      where: { id: agentId },
      data: { securityConfig: nextConfig as Prisma.InputJsonValue },
    });

    return { tags: meta.tags ?? [], notes: meta.notes ?? [] };
  }

  allowedTags() {
    return [...AGENT_TAGS];
  }

  private async requireAgent(agentId: string) {
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, deletedAt: null },
      include: {
        kyc: true,
        user: {
          select: {
            id: true,
            email: true,
            phone: true,
            fullName: true,
            emailVerifiedAt: true,
          },
        },
      },
    });
    if (!agent) throw new NotFoundException('Agent not found');
    return agent;
  }

  private formatAgentCode(id: string) {
    return id.replace(/-/g, '').slice(0, 8).toUpperCase();
  }

  private async resolveLastActivity(agentId: string, lastUsedAt: Date | null) {
    const latest = await this.prisma.systemActivityLog.findFirst({
      where: {
        OR: [{ resourceId: agentId }, { metadata: { path: ['agentId'], equals: agentId } }],
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const candidates = [lastUsedAt, latest?.createdAt].filter(Boolean) as Date[];
    if (!candidates.length) return null;
    return new Date(Math.max(...candidates.map((d) => d.getTime()))).toISOString();
  }

  private parseSecurityConfig(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return raw as Record<string, unknown>;
  }

  private parseAdminMeta(raw: unknown): AdminCenterMeta {
    const config = this.parseSecurityConfig(raw);
    const center = config.adminCenter;
    if (!center || typeof center !== 'object' || Array.isArray(center)) return {};
    return center as AdminCenterMeta;
  }

  private buildListOrder(query: AdminAgentCenterListQueryDto): Prisma.AgentOrderByWithRelationInput {
    const dir = query.order === 'asc' ? 'asc' : 'desc';
    if (query.sort === 'companyName') return { companyName: dir };
    if (query.sort === 'lastActivity') return { lastUsedAt: dir };
    return { createdAt: dir };
  }

  private async buildListWhere(query: AdminAgentCenterListQueryDto): Promise<Prisma.AgentWhereInput> {
    const and: Prisma.AgentWhereInput[] = [{ deletedAt: null }];

    if (query.status) and.push({ status: query.status });
    if (query.kycStatus) and.push({ kyc: { status: query.kycStatus } });
    if (query.apiEnabled !== undefined) and.push({ apiEnabled: query.apiEnabled });
    if (query.webhookEnabled === true) {
      and.push({ webhookConfig: { enabled: true } });
    } else if (query.webhookEnabled === false) {
      and.push({
        OR: [{ webhookConfig: null }, { webhookConfig: { enabled: false } }],
      });
    }
    if (query.createdFrom || query.createdTo) {
      and.push({
        createdAt: {
          ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
          ...(query.createdTo ? { lte: new Date(query.createdTo) } : {}),
        },
      });
    }

    if (query.q?.trim()) {
      const q = query.q.trim();
      const or: Prisma.AgentWhereInput[] = [
        { companyName: { contains: q, mode: 'insensitive' } },
        { contactEmail: { contains: q, mode: 'insensitive' } },
        { user: { email: { contains: q, mode: 'insensitive' } } },
        { user: { phone: { contains: q, mode: 'insensitive' } } },
        { kyc: { taxCode: { contains: q, mode: 'insensitive' } } },
        { apiKeyLookup: { contains: q, mode: 'insensitive' } },
      ];
      if (/^[0-9a-f-]{36}$/i.test(q)) {
        or.push({ id: q });
      }
      and.push({ OR: or });
    }

    if (query.walletStatus === 'empty') {
      and.push({ balance: { lte: 0 } });
    } else if (query.walletStatus === 'low') {
      and.push({ balance: { gt: 0, lte: 1_000_000 } });
    } else if (query.walletStatus === 'ok') {
      and.push({ balance: { gt: 1_000_000 } });
    }

    return { AND: and };
  }
}
