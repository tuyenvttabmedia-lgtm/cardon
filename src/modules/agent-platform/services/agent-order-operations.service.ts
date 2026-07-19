import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FulfillmentStatus,
  OrderChannel,
  Prisma,
  ProviderTransactionStatus,
  SystemActivityEventCategory,
  SystemActivityEventType,
  SystemActivitySeverity,
  SystemActivitySource,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../database/prisma.service';
import { ActivityEventDispatcher } from '../../activity-event/activity-event-dispatcher.service';
import { AgentRepository } from '../../agent/repositories/agent.repository';
import { LedgerService } from '../../agent/services/ledger.service';
import { FulfillmentDispatchService } from '../../provider/services/fulfillment-dispatch.service';
import { AGENT_ROLE_PERMISSIONS, AgentPlatformRole } from '../entities/agent-platform.constants';
import {
  computeLatencyMs,
  mapFulfillmentToPortalStatus,
  maskIp,
  maskJsonPayload,
  maskSecret,
  resolveGateway,
} from '../utils/order-operations.mapper';

export interface OrderListQuery {
  skip?: number;
  take?: number;
  status?: string;
  gateway?: string;
  provider?: string;
  product?: string;
  apiKey?: string;
  ip?: string;
  faceValueMin?: string;
  faceValueMax?: string;
  amountMin?: string;
  amountMax?: string;
  latencyMin?: string;
  latencyMax?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

const ORDER_INCLUDE = {
  orderItems: { include: { variant: { select: { sku: true, name: true, faceValue: true } } } },
  financialTransaction: { select: { id: true, transactionId: true, status: true } },
  providerTransactions: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' as const },
    take: 3,
    include: { provider: { select: { id: true, code: true, name: true } } },
  },
  orderEvents: { orderBy: { createdAt: 'asc' as const }, take: 50 },
} satisfies Prisma.OrderInclude;

const RETRYABLE_STATUSES: FulfillmentStatus[] = [
  FulfillmentStatus.WAITING_ADMIN_RETRY,
  FulfillmentStatus.NEED_MANUAL_REVIEW,
  FulfillmentStatus.PROCESSING,
];

interface ExportJob {
  id: string;
  agentId: string;
  userId: string;
  format: string;
  status: 'pending' | 'ready' | 'failed';
  downloadUrl?: string;
  rowCount?: number;
  createdAt: Date;
  data?: unknown;
}

@Injectable()
export class AgentOrderOperationsService {
  private readonly exportJobs = new Map<string, ExportJob>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentRepository: AgentRepository,
    private readonly ledgerService: LedgerService,
    private readonly activityDispatcher: ActivityEventDispatcher,
    private readonly fulfillmentDispatch: FulfillmentDispatchService,
  ) {}

  getSession(userId: string) {
    return {
      userId,
      platformRole: 'OWNER' as AgentPlatformRole,
      permissions: AGENT_ROLE_PERMISSIONS.OWNER,
    };
  }

  async getStatistics(userId: string) {
    const agent = await this.requireAgent(userId);
    const balance = await this.ledgerService.getBalance(agent.id);
    const startOfDay = this.startOfToday();

    const baseWhere: Prisma.OrderWhereInput = {
      agentId: agent.id,
      channel: OrderChannel.AGENT,
      deletedAt: null,
    };

    const [todayTotal, successToday, failedToday, processingToday, refundToday, recentForRate, hourlyRaw, dailyRaw, productRaw, providerTxns, runtimeGateway] =
      await Promise.all([
        this.prisma.order.count({ where: { ...baseWhere, createdAt: { gte: startOfDay } } }),
        this.prisma.order.count({
          where: { ...baseWhere, createdAt: { gte: startOfDay }, fulfillmentStatus: FulfillmentStatus.COMPLETED },
        }),
        this.prisma.order.count({
          where: { ...baseWhere, createdAt: { gte: startOfDay }, fulfillmentStatus: FulfillmentStatus.FAILED },
        }),
        this.prisma.order.count({
          where: {
            ...baseWhere,
            createdAt: { gte: startOfDay },
            fulfillmentStatus: {
              in: [
                FulfillmentStatus.PENDING,
                FulfillmentStatus.PROCESSING,
                FulfillmentStatus.WAITING_ADMIN_RETRY,
                FulfillmentStatus.NEED_MANUAL_REVIEW,
              ],
            },
          },
        }),
        this.prisma.order.count({
          where: {
            ...baseWhere,
            createdAt: { gte: startOfDay },
            paymentStatus: 'REFUNDED',
          },
        }),
        this.prisma.order.findMany({
          where: baseWhere,
          orderBy: { createdAt: 'desc' },
          take: 200,
          select: { fulfillmentStatus: true, createdAt: true, updatedAt: true },
        }),
        this.prisma.order.findMany({
          where: { ...baseWhere, createdAt: { gte: startOfDay } },
          select: { createdAt: true, fulfillmentStatus: true },
        }),
        this.prisma.order.findMany({
          where: { ...baseWhere, createdAt: { gte: this.daysAgo(30) } },
          select: { createdAt: true, fulfillmentStatus: true },
        }),
        this.prisma.order.findMany({
          where: { ...baseWhere, createdAt: { gte: startOfDay } },
          include: { orderItems: { include: { variant: { select: { sku: true, name: true } } } } },
        }),
        this.prisma.providerTransaction.findMany({
          where: {
            deletedAt: null,
            order: { agentId: agent.id, channel: OrderChannel.AGENT, deletedAt: null, createdAt: { gte: startOfDay } },
          },
          select: { createdAt: true, completedAt: true, status: true },
          take: 500,
        }),
        this.prisma.systemSetting.findUnique({ where: { key: 'payment.default_gateway' } }),
      ]);

    const completedRecent = recentForRate.filter((o) => o.fulfillmentStatus === FulfillmentStatus.COMPLETED).length;
    const failedRecent = recentForRate.filter((o) => o.fulfillmentStatus === FulfillmentStatus.FAILED).length;
    const rateDenom = completedRecent + failedRecent;
    const successRate = rateDenom > 0 ? Math.round((completedRecent / rateDenom) * 100) : 100;

    const latencies = recentForRate
      .map((o) => computeLatencyMs(o.createdAt, o.updatedAt))
      .filter((v): v is number => v !== null);
    const avgLatencyMs =
      latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;

    const esaleLatencies = providerTxns
      .filter((t) => t.completedAt)
      .map((t) => computeLatencyMs(t.createdAt, t.completedAt))
      .filter((v): v is number => v !== null);
    const esaleLatencyMs =
      esaleLatencies.length > 0
        ? Math.round(esaleLatencies.reduce((a, b) => a + b, 0) / esaleLatencies.length)
        : 0;

    const gatewayInUse =
      (runtimeGateway?.value as { code?: string } | null)?.code ??
      (typeof runtimeGateway?.value === 'string' ? runtimeGateway.value : null) ??
      'WALLET';

    return {
      cards: {
        totalToday: todayTotal,
        successToday,
        failedToday,
        processingToday,
        refundToday,
        successRate,
        avgLatencyMs,
        esaleLatencyMs,
        gatewayInUse,
        walletBalance: balance.availableBalance,
      },
      charts: {
        hourly: this.bucketByHour(hourlyRaw),
        daily: this.bucketByDay(dailyRaw),
        byProduct: this.bucketByProduct(productRaw),
      },
      reports: await this.buildReports(agent.id),
      currency: 'VND' as const,
    };
  }

  async listOrders(userId: string, query: OrderListQuery) {
    const agent = await this.requireAgent(userId);
    const skip = query.skip ?? 0;
    const take = Math.min(query.take ?? 25, 100);
    const where = this.buildOrderWhere(agent.id, query);

    const [total, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: ORDER_INCLUDE,
      }),
    ]);

    return {
      items: orders.map((o) => this.toListRow(o, agent.apiKeyLookup)),
      total,
      skip,
      take,
    };
  }

  async searchOrders(userId: string, q: string, skip = 0, take = 25) {
    return this.listOrders(userId, { search: q, skip, take });
  }

  async getOrder(userId: string, orderId: string, reveal = false) {
    const agent = await this.requireAgent(userId);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, agentId: agent.id, channel: OrderChannel.AGENT, deletedAt: null },
      include: {
        ...ORDER_INCLUDE,
        providerTransactions: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          include: { provider: { select: { id: true, code: true, name: true } } },
        },
        providerLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return this.toDetail(order, agent.apiKeyLookup, reveal);
  }

  async getTimeline(userId: string, orderId: string) {
    const detail = await this.getOrder(userId, orderId, false);
    return { orderId, steps: detail.timeline, lifecycle: detail.lifecycle };
  }

  async listWebhooks(userId: string, query: { skip?: number; take?: number; orderId?: string }) {
    const agent = await this.requireAgent(userId);
    const skip = query.skip ?? 0;
    const take = Math.min(query.take ?? 25, 100);

    const orders = await this.prisma.order.findMany({
      where: {
        agentId: agent.id,
        channel: OrderChannel.AGENT,
        deletedAt: null,
        ...(query.orderId ? { id: query.orderId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        orderEvents: { orderBy: { createdAt: 'asc' } },
        orderItems: { include: { variant: { select: { sku: true } } } },
      },
    });

    const items = orders.flatMap((order) => this.buildWebhookEntries(order));
    return { items, total: items.length, skip, take };
  }

  async listActivityLogs(userId: string, query: { skip?: number; take?: number; search?: string }) {
    const agent = await this.requireAgent(userId);
    const skip = query.skip ?? 0;
    const take = Math.min(query.take ?? 25, 100);

    const where: Prisma.SystemActivityLogWhereInput = {
      source: SystemActivitySource.PARTNER,
      OR: [
        { resource: 'agent_orders' },
        { resource: 'agent_order' },
        { metadata: { path: ['agentId'], equals: agent.id } },
      ],
    };

    if (query.search?.trim()) {
      const q = query.search.trim();
      where.AND = [
        {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
            { resourceId: { contains: q, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.systemActivityLog.count({ where }),
      this.prisma.systemActivityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        eventType: r.eventType,
        title: r.title,
        description: r.description,
        resourceId: r.resourceId,
        createdAt: r.createdAt.toISOString(),
        metadata: r.metadata,
      })),
      total,
      skip,
      take,
    };
  }

  async exportOrders(
    userId: string,
    role: AgentPlatformRole,
    format: 'csv' | 'excel' | 'pdf' | 'json',
    query: OrderListQuery,
  ) {
    this.assertCanExport(role);
    const agent = await this.requireAgent(userId);
    const where = this.buildOrderWhere(agent.id, query);
    const count = await this.prisma.order.count({ where });

    if (count > 5000) {
      const jobId = randomUUID();
      const job: ExportJob = {
        id: jobId,
        agentId: agent.id,
        userId,
        format,
        status: 'pending',
        createdAt: new Date(),
      };
      this.exportJobs.set(jobId, job);

      setTimeout(() => {
        void this.runExportJob(jobId, where, format, agent.apiKeyLookup);
      }, 100);

      this.logActivity(userId, undefined, 'export', { format, jobId, rowCount: count, background: true });
      return { mode: 'background' as const, jobId, rowCount: count, status: 'pending' };
    }

    const orders = await this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5000,
      include: ORDER_INCLUDE,
    });
    const rows = orders.map((o) => this.toListRow(o, agent.apiKeyLookup));
    this.logActivity(userId, undefined, 'export', { format, rowCount: rows.length, background: false });
    return { mode: 'immediate' as const, format, rows, rowCount: rows.length };
  }

  getExportJob(userId: string, jobId: string) {
    const job = this.exportJobs.get(jobId);
    if (!job || job.userId !== userId) throw new NotFoundException('Export job not found');
    return {
      jobId: job.id,
      status: job.status,
      format: job.format,
      rowCount: job.rowCount,
      data: job.status === 'ready' ? job.data : undefined,
    };
  }

  async retryOrder(userId: string, role: AgentPlatformRole, orderId: string) {
    if (role === 'READONLY') {
      throw new ForbiddenException('Readonly role cannot retry orders');
    }

    const agent = await this.requireAgent(userId);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, agentId: agent.id, channel: OrderChannel.AGENT, deletedAt: null },
      include: { providerTransactions: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!order) throw new NotFoundException('Order not found');

    if (order.fulfillmentStatus === FulfillmentStatus.COMPLETED) {
      throw new BadRequestException('Order already completed — retry blocked to prevent duplication');
    }

    const latestTxn = order.providerTransactions[0];
    const isRetryableFailure =
      RETRYABLE_STATUSES.includes(order.fulfillmentStatus) ||
      latestTxn?.status === ProviderTransactionStatus.TIMEOUT ||
      latestTxn?.status === ProviderTransactionStatus.FAILED;

    if (!isRetryableFailure) {
      throw new BadRequestException(
        'Retry only allowed for provider timeout, network error, or retryable status',
      );
    }

    const result = await this.fulfillmentDispatch.retryOrderFulfillment(orderId);
    this.logActivity(userId, undefined, 'retry', { orderId, fulfillmentStatus: result.fulfillmentStatus });

    return {
      ok: true,
      orderId,
      fulfillmentStatus: result.fulfillmentStatus,
      providerTransactionId: result.providerTransactionId ?? null,
      retryable: true,
    };
  }

  logActivity(
    userId: string,
    email: string | undefined,
    action: 'view_detail' | 'filter' | 'export' | 'retry' | 'search' | 'timeline',
    metadata?: Record<string, unknown>,
  ) {
    const eventType =
      action === 'export'
        ? SystemActivityEventType.EXPORT_CSV
        : action === 'retry'
          ? SystemActivityEventType.QUEUE_RETRY
          : SystemActivityEventType.QUEUE_COMPLETED;

    this.activityDispatcher.dispatch({
      eventType,
      eventCategory: SystemActivityEventCategory.ORDER,
      severity: SystemActivitySeverity.INFO,
      source: SystemActivitySource.PARTNER,
      resource: 'agent_orders',
      resourceId: (metadata?.orderId as string) ?? userId,
      title: `Orders ${action}`,
      description: `Agent order operations: ${action}`,
      performedBy: userId,
      performedEmail: email ?? null,
      metadata: { action, ...metadata },
    });
  }

  assertCanExport(role: AgentPlatformRole) {
    if (role === 'READONLY') {
      throw new ForbiddenException('Readonly role cannot export order data');
    }
    if (!AGENT_ROLE_PERMISSIONS[role]?.includes('orders.export')) {
      throw new ForbiddenException('Insufficient permission to export orders');
    }
  }

  private async runExportJob(jobId: string, where: Prisma.OrderWhereInput, format: string, apiKeyLookup: string | null) {
    const job = this.exportJobs.get(jobId);
    if (!job) return;
    try {
      const orders = await this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 50000,
        include: ORDER_INCLUDE,
      });
      job.data = orders.map((o) => this.toListRow(o, apiKeyLookup));
      job.rowCount = orders.length;
      job.status = 'ready';
      job.format = format;
    } catch {
      job.status = 'failed';
    }
  }

  private async buildReports(agentId: string) {
    const since = this.daysAgo(7);
    const orders = await this.prisma.order.findMany({
      where: { agentId, channel: OrderChannel.AGENT, deletedAt: null, createdAt: { gte: since } },
      include: {
        orderItems: { include: { variant: { select: { sku: true, name: true } } } },
        providerTransactions: {
          where: { deletedAt: null },
          include: { provider: { select: { code: true, name: true } } },
        },
      },
    });

    const total = orders.length;
    const success = orders.filter((o) => o.fulfillmentStatus === FulfillmentStatus.COMPLETED).length;
    const failed = orders.filter((o) => o.fulfillmentStatus === FulfillmentStatus.FAILED).length;
    const timeout = orders.filter((o) =>
      o.providerTransactions.some((t) => t.status === ProviderTransactionStatus.TIMEOUT),
    ).length;

    const latencies = orders
      .map((o) => computeLatencyMs(o.createdAt, o.updatedAt))
      .filter((v): v is number => v !== null);
    const avgLatencyMs =
      latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;

    const gatewayUsage: Record<string, number> = {};
    const providerUsage: Record<string, number> = {};
    const productCounts: Record<string, { name: string; count: number }> = {};
    const errorCounts: Record<string, number> = {};
    const hourly: Record<number, number> = {};

    for (const order of orders) {
      const gw = resolveGateway(order);
      gatewayUsage[gw] = (gatewayUsage[gw] ?? 0) + 1;
      const hour = order.createdAt.getHours();
      hourly[hour] = (hourly[hour] ?? 0) + 1;

      const item = order.orderItems[0];
      if (item) {
        const key = item.variant.sku;
        productCounts[key] = {
          name: item.variant.name,
          count: (productCounts[key]?.count ?? 0) + 1,
        };
      }

      for (const txn of order.providerTransactions) {
        const code = txn.provider?.code ?? 'unknown';
        providerUsage[code] = (providerUsage[code] ?? 0) + 1;
        if (txn.errorCode) {
          errorCounts[txn.errorCode] = (errorCounts[txn.errorCode] ?? 0) + 1;
        }
      }
    }

    return {
      successRate: total > 0 ? Math.round((success / total) * 100) : 100,
      failureRate: total > 0 ? Math.round((failed / total) * 100) : 0,
      timeoutRate: total > 0 ? Math.round((timeout / total) * 100) : 0,
      avgLatencyMs,
      gatewayUsage,
      providerUsage,
      topProducts: Object.entries(productCounts)
        .map(([sku, v]) => ({ sku, name: v.name, count: v.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      topErrors: Object.entries(errorCounts)
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      hourlyDistribution: Object.entries(hourly).map(([hour, count]) => ({
        hour: Number(hour),
        count,
      })),
    };
  }

  private buildOrderWhere(agentId: string, query: OrderListQuery): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = {
      agentId,
      channel: OrderChannel.AGENT,
      deletedAt: null,
    };

    if (query.status && query.status !== 'all') {
      const statusMap: Record<string, FulfillmentStatus[]> = {
        pending: [
          FulfillmentStatus.PENDING,
          FulfillmentStatus.PROCESSING,
          FulfillmentStatus.WAITING_ADMIN_RETRY,
          FulfillmentStatus.NEED_MANUAL_REVIEW,
        ],
        completed: [FulfillmentStatus.COMPLETED],
        failed: [FulfillmentStatus.FAILED],
        processing: [FulfillmentStatus.PROCESSING, FulfillmentStatus.PENDING],
      };
      const mapped = statusMap[query.status.toLowerCase()];
      if (mapped) where.fulfillmentStatus = { in: mapped };
    }

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
    }

    if (query.gateway) {
      if (query.gateway.toUpperCase() === 'WALLET') {
        where.OR = [{ paymentGateway: null }, { paymentGateway: 'WALLET' }];
      } else {
        where.paymentGateway = query.gateway;
      }
    }

    if (query.product) {
      where.orderItems = { some: { variant: { sku: { contains: query.product, mode: 'insensitive' } } } };
    }

    if (query.amountMin || query.amountMax) {
      where.totalAmount = {};
      if (query.amountMin) where.totalAmount.gte = query.amountMin;
      if (query.amountMax) where.totalAmount.lte = query.amountMax;
    }

    if (query.search?.trim()) {
      const q = query.search.trim();
      const or: Prisma.OrderWhereInput[] = [
        { orderCode: { contains: q, mode: 'insensitive' } },
        { agentRequestId: { contains: q, mode: 'insensitive' } },
        {
          financialTransaction: {
            is: { transactionId: { contains: q, mode: 'insensitive' } },
          },
        },
        {
          providerTransactions: {
            some: {
              OR: [
                { providerTransactionId: { contains: q, mode: 'insensitive' } },
                { providerReference: { contains: q, mode: 'insensitive' } },
                { requestId: { contains: q, mode: 'insensitive' } },
              ],
            },
          },
        },
      ];
      if (/^[0-9a-f-]{36}$/i.test(q)) {
        or.unshift({ id: q });
      }
      where.OR = or;
    }

    return where;
  }

  private toListRow(
    order: Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>,
    apiKeyLookup: string | null,
  ) {
    const item = order.orderItems[0];
    const latestProvider = order.providerTransactions[0];
    const trace =
      order.clientTrace && typeof order.clientTrace === 'object' && !Array.isArray(order.clientTrace)
        ? (order.clientTrace as Record<string, unknown>)
        : {};
    const completedAt =
      order.fulfillmentStatus === FulfillmentStatus.COMPLETED ? order.updatedAt : latestProvider?.completedAt;

    return {
      id: order.id,
      requestId: order.agentRequestId ?? '',
      orderId: order.orderCode,
      transactionId: order.financialTransaction?.transactionId ?? order.transactionId ?? '',
      partnerOrderId: order.agentRequestId ?? '',
      customerReference: (trace.customerReference as string) ?? null,
      providerTransaction: latestProvider?.providerTransactionId ?? latestProvider?.providerReference ?? null,
      gateway: resolveGateway(order),
      product: item?.variant.sku ?? '',
      productName: item?.variant.name ?? '',
      faceValue: order.faceValue?.toFixed?.(2) ?? item?.variant.faceValue?.toFixed?.(2) ?? order.totalAmount.toFixed(2),
      sellPrice: order.sellAmount?.toFixed?.(2) ?? order.totalAmount.toFixed(2),
      costPrice: order.providerCost?.toFixed?.(2) ?? '0.00',
      profit: order.profit?.toFixed?.(2) ?? '0.00',
      status: mapFulfillmentToPortalStatus(order.fulfillmentStatus),
      fulfillmentStatus: order.fulfillmentStatus,
      createdAt: order.createdAt.toISOString(),
      completedAt: completedAt?.toISOString?.() ?? null,
      latencyMs: computeLatencyMs(order.createdAt, completedAt ?? null),
      provider: latestProvider?.provider?.name ?? latestProvider?.provider?.code ?? null,
      retryCount: latestProvider?.attempt ?? 0,
      sourceIp: maskIp((trace.ipAddress as string) ?? null),
      apiKey: maskSecret(apiKeyLookup ?? undefined, 4),
    };
  }

  private toDetail(
    order: Prisma.OrderGetPayload<{
      include: typeof ORDER_INCLUDE & {
        providerLogs: true;
        providerTransactions: { include: { provider: { select: { id: true; code: true; name: true } } } };
      };
    }>,
    apiKeyLookup: string | null,
    reveal: boolean,
  ) {
    const listRow = this.toListRow(order, apiKeyLookup);
    const trace =
      order.clientTrace && typeof order.clientTrace === 'object' && !Array.isArray(order.clientTrace)
        ? (order.clientTrace as Record<string, unknown>)
        : {};

    const latestProvider = order.providerTransactions[0];
    const mask = reveal ? <T,>(v: T) => v : maskJsonPayload;

    const timeline = this.buildTimelineSteps(order);
    const lifecycle = [
      'API',
      'Wallet Hold',
      'Provider',
      'Response',
      'Webhook',
      'Ledger',
      'Notification',
      'Activity',
      'Completed',
    ].map((stage) => ({
      stage,
      status: this.resolveLifecycleStatus(stage, order),
      at: this.resolveLifecycleAt(stage, order),
    }));

    return {
      ...listRow,
      apiRequest: mask({
        requestId: order.agentRequestId,
        product: listRow.product,
        amount: listRow.sellPrice,
        capturedAt: order.createdAt.toISOString(),
      }),
      apiResponse: mask({
        status: listRow.status,
        orderCode: order.orderCode,
        fulfillmentStatus: order.fulfillmentStatus,
      }),
      providerRequest: mask(latestProvider?.requestPayload ?? {}),
      providerResponse: mask(latestProvider?.responsePayload ?? {}),
      webhook: this.buildWebhookEntries(order)[0] ?? null,
      walletHold: order.financialTransaction
        ? {
            transactionId: order.financialTransaction.transactionId,
            status: order.financialTransaction.status,
          }
        : null,
      ledgerCommit:
        order.fulfillmentStatus === FulfillmentStatus.COMPLETED
          ? { status: 'COMMITTED', at: order.updatedAt.toISOString() }
          : order.fulfillmentStatus === FulfillmentStatus.FAILED
            ? { status: 'RELEASED', at: order.updatedAt.toISOString() }
            : { status: 'HELD', at: order.createdAt.toISOString() },
      notification: order.orderEvents.find((e) => e.eventType === 'EMAIL_SENT' || e.eventType === 'ORDER_DELIVERED')
        ? { sent: true }
        : { sent: false },
      activityLog: order.orderEvents.map((e) => ({
        id: e.id,
        type: e.eventType,
        message: e.message,
        at: e.createdAt.toISOString(),
        metadata: mask(e.metadata),
      })),
      auditLink: null,
      clientTrace: {
        ipAddress: reveal ? ((trace.ipAddress as string) ?? null) : maskIp((trace.ipAddress as string) ?? null),
        userAgent: reveal ? ((trace.userAgent as string) ?? null) : maskSecret((trace.userAgent as string) ?? undefined, 6),
      },
      timeline,
      lifecycle,
      retryAllowed:
        order.fulfillmentStatus !== FulfillmentStatus.COMPLETED &&
        (RETRYABLE_STATUSES.includes(order.fulfillmentStatus) ||
          latestProvider?.status === ProviderTransactionStatus.TIMEOUT ||
          latestProvider?.status === ProviderTransactionStatus.FAILED),
    };
  }

  private buildTimelineSteps(order: {
    createdAt: Date;
    updatedAt: Date;
    fulfillmentStatus: FulfillmentStatus;
    orderEvents: Array<{ id: string; eventType: string; message: string; createdAt: Date; metadata: unknown }>;
    providerTransactions: Array<{ createdAt: Date; completedAt: Date | null; status: string }>;
    financialTransaction?: { status: string } | null;
  }) {
    const steps: Array<{ id: string; stage: string; label: string; status: string; at: string; metadata?: unknown }> = [];

    steps.push({
      id: 'api',
      stage: 'API',
      label: 'Nhận request API',
      status: 'completed',
      at: order.createdAt.toISOString(),
    });

    steps.push({
      id: 'wallet',
      stage: 'Wallet Hold',
      label: 'Giữ số dư ví',
      status: order.financialTransaction ? 'completed' : 'pending',
      at: order.createdAt.toISOString(),
    });

    const providerTxn = order.providerTransactions[0];
    steps.push({
      id: 'provider',
      stage: 'Provider',
      label: 'Gửi nhà cung cấp',
      status: providerTxn ? (providerTxn.status === 'SUCCESS' ? 'completed' : providerTxn.status.toLowerCase()) : 'pending',
      at: providerTxn?.createdAt.toISOString() ?? order.createdAt.toISOString(),
    });

    steps.push({
      id: 'response',
      stage: 'Response',
      label: 'Phản hồi provider',
      status:
        order.fulfillmentStatus === FulfillmentStatus.COMPLETED
          ? 'completed'
          : order.fulfillmentStatus === FulfillmentStatus.FAILED
            ? 'failed'
            : 'processing',
      at: providerTxn?.completedAt?.toISOString() ?? order.updatedAt.toISOString(),
    });

    for (const event of order.orderEvents) {
      steps.push({
        id: event.id,
        stage: event.eventType,
        label: event.message,
        status: 'completed',
        at: event.createdAt.toISOString(),
        metadata: maskJsonPayload(event.metadata),
      });
    }

    steps.push({
      id: 'completed',
      stage: 'Completed',
      label: 'Hoàn tất vòng đời',
      status:
        order.fulfillmentStatus === FulfillmentStatus.COMPLETED
          ? 'completed'
          : order.fulfillmentStatus === FulfillmentStatus.FAILED
            ? 'failed'
            : 'processing',
      at: order.updatedAt.toISOString(),
    });

    return steps;
  }

  private buildWebhookEntries(order: {
    id: string;
    agentRequestId: string | null;
    orderCode: string;
    fulfillmentStatus: FulfillmentStatus;
    createdAt: Date;
    updatedAt: Date;
    orderEvents: Array<{ eventType: string; createdAt: Date; metadata: unknown }>;
    orderItems: Array<{ variant: { sku: string } }>;
  }) {
    const delivered = order.orderEvents.find((e) => e.eventType === 'ORDER_DELIVERED');
    const failed = order.fulfillmentStatus === FulfillmentStatus.FAILED;
    const processingMs = Math.max(0, order.updatedAt.getTime() - order.createdAt.getTime());

    return [
      {
        id: `${order.id}-webhook`,
        orderId: order.id,
        requestId: order.agentRequestId,
        received: true,
        verified: true,
        processed: order.fulfillmentStatus !== FulfillmentStatus.PENDING,
        completed: order.fulfillmentStatus === FulfillmentStatus.COMPLETED,
        failed,
        retry: order.orderEvents.filter((e) => e.eventType.includes('RETRY')).length,
        signature: maskSecret('whsec_partner_callback', 4),
        payload: maskJsonPayload({
          request_id: order.agentRequestId,
          order_code: order.orderCode,
          status: order.fulfillmentStatus,
          product_code: order.orderItems[0]?.variant.sku,
        }),
        headers: maskJsonPayload({
          'Content-Type': 'application/json',
          'X-Cardon-Signature': 'masked',
        }),
        processingTimeMs: processingMs,
        deliveredAt: delivered?.createdAt.toISOString() ?? null,
        createdAt: order.createdAt.toISOString(),
      },
    ];
  }

  private resolveLifecycleStatus(stage: string, order: { fulfillmentStatus: FulfillmentStatus; providerTransactions: unknown[] }) {
    const map: Record<string, string> = {
      API: 'completed',
      'Wallet Hold': order.providerTransactions.length ? 'completed' : 'active',
      Provider: order.providerTransactions.length ? 'completed' : 'pending',
      Response:
        order.fulfillmentStatus === FulfillmentStatus.COMPLETED
          ? 'completed'
          : order.fulfillmentStatus === FulfillmentStatus.FAILED
            ? 'failed'
            : 'active',
      Webhook:
        order.fulfillmentStatus === FulfillmentStatus.COMPLETED
          ? 'completed'
          : order.fulfillmentStatus === FulfillmentStatus.FAILED
            ? 'failed'
            : 'pending',
      Ledger:
        order.fulfillmentStatus === FulfillmentStatus.COMPLETED
          ? 'completed'
          : order.fulfillmentStatus === FulfillmentStatus.FAILED
            ? 'completed'
            : 'active',
      Notification: order.fulfillmentStatus === FulfillmentStatus.COMPLETED ? 'completed' : 'pending',
      Activity: 'completed',
      Completed:
        order.fulfillmentStatus === FulfillmentStatus.COMPLETED
          ? 'completed'
          : order.fulfillmentStatus === FulfillmentStatus.FAILED
            ? 'failed'
            : 'pending',
    };
    return map[stage] ?? 'pending';
  }

  private resolveLifecycleAt(stage: string, order: { createdAt: Date; updatedAt: Date }) {
    if (stage === 'Completed') return order.updatedAt.toISOString();
    return order.createdAt.toISOString();
  }

  private bucketByHour(
    rows: Array<{ createdAt: Date; fulfillmentStatus: FulfillmentStatus }>,
  ) {
    const buckets: Record<string, { total: number; success: number; failed: number }> = {};
    for (const row of rows) {
      const key = `${row.createdAt.getHours().toString().padStart(2, '0')}:00`;
      buckets[key] ??= { total: 0, success: 0, failed: 0 };
      buckets[key].total += 1;
      if (row.fulfillmentStatus === FulfillmentStatus.COMPLETED) buckets[key].success += 1;
      if (row.fulfillmentStatus === FulfillmentStatus.FAILED) buckets[key].failed += 1;
    }
    return Object.entries(buckets).map(([hour, v]) => ({ hour, ...v }));
  }

  private bucketByDay(rows: Array<{ createdAt: Date; fulfillmentStatus: FulfillmentStatus }>) {
    const buckets: Record<string, { total: number; success: number; failed: number }> = {};
    for (const row of rows) {
      const key = row.createdAt.toISOString().slice(0, 10);
      buckets[key] ??= { total: 0, success: 0, failed: 0 };
      buckets[key].total += 1;
      if (row.fulfillmentStatus === FulfillmentStatus.COMPLETED) buckets[key].success += 1;
      if (row.fulfillmentStatus === FulfillmentStatus.FAILED) buckets[key].failed += 1;
    }
    return Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }));
  }

  private bucketByProduct(
    rows: Array<{
      orderItems: Array<{ variant: { sku: string; name: string } }>;
    }>,
  ) {
    const buckets: Record<string, { name: string; count: number }> = {};
    for (const row of rows) {
      const item = row.orderItems[0];
      if (!item) continue;
      const sku = item.variant.sku;
      buckets[sku] ??= { name: item.variant.name, count: 0 };
      buckets[sku].count += 1;
    }
    return Object.entries(buckets)
      .map(([sku, v]) => ({ sku, name: v.name, count: v.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private async requireAgent(userId: string) {
    const agent = await this.agentRepository.findByUserId(userId);
    if (!agent) throw new NotFoundException('Agent profile not found');
    return agent;
  }

  private startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private daysAgo(days: number) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(0, 0, 0, 0);
    return d;
  }
}
