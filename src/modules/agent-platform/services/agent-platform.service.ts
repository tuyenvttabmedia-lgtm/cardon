import { Injectable, NotFoundException } from '@nestjs/common';
import { FulfillmentStatus, OrderChannel, ProductVariantStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { AgentRepository } from '../../agent/repositories/agent.repository';
import { AgentService } from '../../agent/services/agent.service';
import { LedgerService } from '../../agent/services/ledger.service';
import { NotificationService } from '../../notification/services/notification.service';
import { AgentOrganizationService } from '../../agent-organization/services/agent-organization.service';
import { AgentMemberContextService } from '../../agent-organization/services/agent-member-context.service';
import { PricingService } from '../../product/services/pricing.service';
import { AGENT_PLATFORM_ROLES, AGENT_ROLE_LABELS } from '../entities/agent-platform.constants';

@Injectable()
export class AgentPlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentRepository: AgentRepository,
    private readonly agentService: AgentService,
    private readonly ledgerService: LedgerService,
    private readonly notificationService: NotificationService,
    private readonly memberContext: AgentMemberContextService,
    private readonly organizationService: AgentOrganizationService,
    private readonly pricingService: PricingService,
  ) {}

  async getDashboard(userId: string) {
    const agent = await this.requireAgentByUser(userId);
    const balance = await this.ledgerService.getBalance(agent.id);
    const startOfDay = this.startOfToday();

    const [todayOrders, todayRevenueAgg, recentOrders, webhook, unreadNotifications] =
      await Promise.all([
        this.prisma.order.count({
          where: {
            agentId: agent.id,
            channel: OrderChannel.AGENT,
            deletedAt: null,
            createdAt: { gte: startOfDay },
          },
        }),
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
        this.prisma.order.findMany({
          where: {
            agentId: agent.id,
            channel: OrderChannel.AGENT,
            deletedAt: null,
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
          select: { fulfillmentStatus: true },
        }),
        this.prisma.agentWebhookConfig.findUnique({ where: { agentId: agent.id } }),
        this.notificationService.countUnreadUserNotifications(userId),
      ]);

    const completed = recentOrders.filter((o) => o.fulfillmentStatus === FulfillmentStatus.COMPLETED).length;
    const failed = recentOrders.filter((o) => o.fulfillmentStatus === FulfillmentStatus.FAILED).length;
    const successDenominator = completed + failed;
    const successRate = successDenominator > 0 ? Math.round((completed / successDenominator) * 100) : 100;

    return {
      walletBalance: balance.balance,
      frozenBalance: balance.heldBalance,
      availableBalance: balance.availableBalance,
      todayOrders,
      revenueToday: todayRevenueAgg._sum.totalAmount?.toFixed(2) ?? '0.00',
      profitToday: '0.00',
      pendingSettlement: '0.00',
      pendingDeposit: '0.00',
      apiCallsToday: todayOrders,
      successRate,
      lastWebhookAt: webhook?.updatedAt?.toISOString() ?? null,
      unreadNotifications,
      currency: 'VND' as const,
    };
  }

  async getWallet(userId: string) {
    const agent = await this.requireAgentByUser(userId);
    const balance = await this.ledgerService.getBalance(agent.id);
    return {
      currentBalance: balance.balance,
      frozenBalance: balance.heldBalance,
      availableBalance: balance.availableBalance,
      creditLimit: '0.00',
      pendingDeposit: '0.00',
      pendingWithdraw: '0.00',
      currency: 'VND' as const,
    };
  }

  async listOrders(
    userId: string,
    query: { status?: string; skip?: number; take?: number },
  ) {
    const agent = await this.requireAgentByUser(userId);
    const skip = query.skip ?? 0;
    const take = Math.min(query.take ?? 20, 100);

    const statusFilter = this.mapOrderTabToFulfillment(query.status);
    const orders = await this.prisma.order.findMany({
      where: {
        agentId: agent.id,
        channel: OrderChannel.AGENT,
        deletedAt: null,
        ...(statusFilter ? { fulfillmentStatus: { in: statusFilter } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        orderItems: {
          include: { variant: { select: { sku: true, name: true } } },
        },
      },
    });

    return orders.map((order) => {
      const item = order.orderItems[0];
      return {
        id: order.id,
        request_id: order.agentRequestId ?? '',
        product_code: item?.variant.sku ?? '',
        product_name: item?.variant.name ?? '',
        amount: order.totalAmount.toFixed(2),
        status: this.mapFulfillmentToPortalStatus(order.fulfillmentStatus),
        fulfillment_status: order.fulfillmentStatus,
        created_at: order.createdAt.toISOString(),
      };
    });
  }

  async listProducts(userId: string) {
    const agent = await this.requireAgentByUser(userId);

    const variants = await this.prisma.productVariant.findMany({
      where: { deletedAt: null, status: ProductVariantStatus.ACTIVE },
      select: {
        id: true,
        sku: true,
        name: true,
        product: { select: { name: true, category: { select: { name: true } } } },
      },
      orderBy: { sku: 'asc' },
      take: 500,
    });

    const items = await Promise.all(
      variants.map(async (variant) => {
        const resolved = await this.pricingService.resolveAgentPrice(agent.id, variant.id);
        return {
          id: variant.id,
          variantId: variant.id,
          sku: variant.sku,
          name: variant.name,
          category: variant.product.category?.name ?? null,
          agentPrice: resolved.sellingPrice,
          status: 'ACTIVE',
        };
      }),
    );

    return {
      readOnly: true,
      items,
    };
  }

  async getApiCenter(userId: string) {
    const agent = await this.requireAgentByUser(userId);
    const credentials = await this.agentService.getMyCredentialsStatus(userId);
    return {
      ...credentials,
      rateLimit: agent.rateLimit,
      ipWhitelist: [],
      usageToday: 0,
      statistics: {
        totalCalls: 0,
        successRate: 100,
      },
    };
  }

  async getWebhooks(userId: string) {
    const agent = await this.requireAgentByUser(userId);
    const config = await this.prisma.agentWebhookConfig.findUnique({ where: { agentId: agent.id } });
    return {
      configured: !!config,
      callbackUrl: config?.callbackUrl ?? null,
      enabled: config?.enabled ?? false,
      events: config?.events ?? [],
      updatedAt: config?.updatedAt?.toISOString() ?? null,
      retryPolicy: 'foundation',
      logs: [],
    };
  }

  async listInvoices(userId: string) {
    const agent = await this.requireAgentByUser(userId);
    const rows = await this.prisma.invoice.findMany({
      where: { agentId: agent.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      type: inv.type,
      status: inv.status,
      totalAmount: inv.totalAmount.toFixed(2),
      issuedAt: inv.issuedAt?.toISOString() ?? null,
      createdAt: inv.createdAt.toISOString(),
    }));
  }

  async getUsers(userId: string) {
    const data = await this.organizationService.listUsers(userId, { page: 1, limit: 100 });
    return {
      members: data.items.map((m) => ({
        id: m.userId,
        memberId: m.id,
        email: m.email,
        name: m.name,
        platformRole: m.role,
        status: m.status,
        lastLoginAt: m.lastLoginAt,
        isPrimary: m.role === 'OWNER',
        twoFactorEnabled: m.twoFactorEnabled,
      })),
      invites: data.invites,
      roles: AGENT_PLATFORM_ROLES,
      roleLabels: AGENT_ROLE_LABELS,
    };
  }

  async listNotifications(userId: string) {
    const items = await this.notificationService.listUserNotifications(userId);
    return { items };
  }

  async getSettlement(userId: string) {
    const agent = await this.requireAgentByUser(userId);
    return {
      currentCycle: null,
      history: [],
      invoices: [],
      agentId: agent.id,
      foundation: true,
    };
  }

  async getReports(userId: string) {
    const dashboard = await this.getDashboard(userId);
    return {
      revenue: { today: dashboard.revenueToday, period: 'today' },
      profit: { today: dashboard.profitToday, period: 'today' },
      topProducts: [],
      orders: { today: dashboard.todayOrders },
      apiUsage: { today: dashboard.apiCallsToday },
      settlement: { pending: dashboard.pendingSettlement },
    };
  }

  async getSession(
    userId: string,
    user?: { impersonatedBy?: string; impersonationSessionId?: string; impersonationReadOnly?: boolean },
  ) {
    const impersonation =
      user?.impersonationSessionId && user.impersonatedBy
        ? {
            sessionId: user.impersonationSessionId,
            adminUserId: user.impersonatedBy,
            readOnly: user.impersonationReadOnly ?? true,
          }
        : undefined;
    const ctx = await this.memberContext.resolve(userId, impersonation);
    return this.organizationService.getSessionPayload(ctx);
  }

  private async requireAgentByUser(userId: string) {
    const agent = await this.agentRepository.findByUserId(userId);
    if (!agent) throw new NotFoundException('Agent profile not found');
    return agent;
  }

  private startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private mapOrderTabToFulfillment(tab?: string): FulfillmentStatus[] | null {
    switch ((tab ?? 'all').toLowerCase()) {
      case 'pending':
        return [
          FulfillmentStatus.PENDING,
          FulfillmentStatus.PROCESSING,
          FulfillmentStatus.WAITING_ADMIN_RETRY,
          FulfillmentStatus.NEED_MANUAL_REVIEW,
        ];
      case 'completed':
        return [FulfillmentStatus.COMPLETED];
      case 'failed':
        return [FulfillmentStatus.FAILED];
      case 'refund':
        return [];
      default:
        return null;
    }
  }

  private mapFulfillmentToPortalStatus(status: FulfillmentStatus): 'SUCCESS' | 'PROCESSING' | 'FAILED' {
    if (status === FulfillmentStatus.COMPLETED) return 'SUCCESS';
    if (status === FulfillmentStatus.FAILED) return 'FAILED';
    return 'PROCESSING';
  }
}
