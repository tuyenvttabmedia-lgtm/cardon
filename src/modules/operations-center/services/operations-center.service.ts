import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CardRecordStatus,
  FulfillmentStatus,
  InvoiceStatus,
  LedgerReferenceType,
  OrderChannel,
  OrderPaymentStatus,
  PaymentReconciliationStatus,
  PaymentRecordStatus,
  ProviderTransactionStatus,
  SystemActivityEventCategory,
  SystemActivityEventType,
  SystemActivitySeverity,
  SystemActivitySource,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { ActivityEventDispatcher } from '../../activity-event/activity-event-dispatcher.service';
import { FinanceRepository } from '../../finance/repositories/finance.repository';
import { InvoiceService } from '../../finance/services/invoice.service';
import {
  OperationsExceptionStatus,
  OperationsMismatchSeverity,
  OperationsMismatchType,
} from '../entities/operations-center.constants';

export interface OperationsListQuery {
  skip?: number;
  take?: number;
  severity?: string;
  status?: string;
  gateway?: string;
  provider?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  assignedTo?: string;
}

export interface OperationsExceptionState {
  id: string;
  status: OperationsExceptionStatus;
  assignedTo: string | null;
  assignedEmail: string | null;
  notes: Array<{ at: string; by: string; text: string }>;
  createdAt: string;
  updatedAt: string;
}

interface ExceptionState extends OperationsExceptionState {}

@Injectable()
export class OperationsCenterService {
  private readonly exceptionState = new Map<string, ExceptionState>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly financeRepository: FinanceRepository,
    private readonly invoiceService: InvoiceService,
    private readonly activityDispatcher: ActivityEventDispatcher,
  ) {}

  async getDashboard() {
    const startOfDay = this.startOfToday();
    const pendingThreshold = new Date(Date.now() - 30 * 60 * 1000);

    const [
      transactionsToday,
      webhookPending,
      providerTimeout,
      needManualReview,
      invoicesPending,
      exceptions,
      mismatches,
    ] = await Promise.all([
      this.prisma.order.count({ where: { deletedAt: null, createdAt: { gte: startOfDay } } }),
      this.prisma.webhookLog.count({ where: { processed: false, createdAt: { gte: startOfDay } } }),
      this.prisma.providerTransaction.count({
        where: { deletedAt: null, status: ProviderTransactionStatus.TIMEOUT, createdAt: { gte: startOfDay } },
      }),
      this.prisma.order.count({
        where: {
          deletedAt: null,
          fulfillmentStatus: {
            in: [FulfillmentStatus.NEED_MANUAL_REVIEW, FulfillmentStatus.WAITING_ADMIN_RETRY],
          },
        },
      }),
      this.prisma.invoice.count({ where: { deletedAt: null, status: InvoiceStatus.DRAFT } }),
      this.detectExceptions({ take: 500 }),
      this.detectMismatches({ take: 500 }),
    ]);

    const openExceptions = exceptions.items.filter((e) => e.status === 'OPEN' || e.status === 'INVESTIGATING').length;
    const resolved = [...this.exceptionState.values()].filter((e) => e.status === 'RESOLVED');
    const avgResolutionMs =
      resolved.length > 0
        ? Math.round(
            resolved.reduce((sum, e) => sum + (Date.parse(e.updatedAt) - Date.parse(e.createdAt)), 0) /
              resolved.length,
          )
        : 0;

    return {
      cards: {
        transactionsToday,
        exceptions: openExceptions,
        needManualReview,
        webhookPending,
        providerTimeout,
        mismatch: mismatches.summary.mismatch,
        invoicesPending,
        avgResolutionMs,
      },
      asOf: new Date().toISOString(),
    };
  }

  async getReconciliationSummary() {
    const mismatches = await this.detectMismatches({ take: 2000 });
    return mismatches.summary;
  }

  async listReconciliation(query: OperationsListQuery) {
    return this.detectMismatches(query);
  }

  async listExceptions(query: OperationsListQuery) {
    return this.detectExceptions(query);
  }

  updateException(
    id: string,
    patch: {
      status?: OperationsExceptionStatus;
      assignedTo?: string | null;
      assignedEmail?: string | null;
      note?: string;
      performedBy: string;
      performedEmail?: string;
    },
  ): OperationsExceptionState {
    const now = new Date().toISOString();
    const existing = this.exceptionState.get(id) ?? {
      id,
      status: 'OPEN' as OperationsExceptionStatus,
      assignedTo: null,
      assignedEmail: null,
      notes: [],
      createdAt: now,
      updatedAt: now,
    };

    if (patch.status) existing.status = patch.status;
    if (patch.assignedTo !== undefined) existing.assignedTo = patch.assignedTo;
    if (patch.assignedEmail !== undefined) existing.assignedEmail = patch.assignedEmail;
    if (patch.note?.trim()) {
      existing.notes.push({
        at: new Date().toISOString(),
        by: patch.performedEmail ?? patch.performedBy,
        text: patch.note.trim(),
      });
    }
    existing.updatedAt = new Date().toISOString();
    this.exceptionState.set(id, existing);

    this.activityDispatcher.dispatch({
      eventType: SystemActivityEventType.QUEUE_COMPLETED,
      eventCategory: SystemActivityEventCategory.FINANCE,
      severity: SystemActivitySeverity.INFO,
      source: SystemActivitySource.ADMIN,
      resource: 'operations_exception',
      resourceId: id,
      title: `Exception ${patch.status ?? 'updated'}`,
      description: patch.note ?? `Exception ${id} updated`,
      performedBy: patch.performedBy,
      performedEmail: patch.performedEmail ?? null,
      metadata: { ...patch, exceptionId: id },
    });

    return existing;
  }

  async globalSearch(q: string) {
    const term = q.trim();
    if (!term) return { orders: [], payments: [], invoices: [], agents: [] };

    const [orders, payments, invoices, agents] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          deletedAt: null,
          OR: [
            { orderCode: { contains: term, mode: 'insensitive' } },
            { agentRequestId: { contains: term, mode: 'insensitive' } },
            { guestEmail: { contains: term, mode: 'insensitive' } },
          ],
        },
        take: 10,
        select: { id: true, orderCode: true, fulfillmentStatus: true, paymentStatus: true, createdAt: true },
      }),
      this.prisma.payment.findMany({
        where: {
          OR: [
            { paymentReference: { contains: term, mode: 'insensitive' } },
            { idempotencyKey: { contains: term, mode: 'insensitive' } },
          ],
        },
        take: 10,
        select: { id: true, paymentReference: true, status: true, gateway: true, createdAt: true },
      }),
      this.prisma.invoice.findMany({
        where: {
          deletedAt: null,
          OR: [
            { invoiceNumber: { contains: term, mode: 'insensitive' } },
          ],
        },
        take: 10,
        select: { id: true, invoiceNumber: true, status: true, totalAmount: true, createdAt: true },
      }),
      this.prisma.agent.findMany({
        where: {
          deletedAt: null,
          OR: [
            { companyName: { contains: term, mode: 'insensitive' } },
            { contactEmail: { contains: term, mode: 'insensitive' } },
          ],
        },
        take: 10,
        select: { id: true, companyName: true, status: true },
      }),
    ]);

    return {
      orders: orders.map((o) => ({
        id: o.id,
        label: o.orderCode,
        status: o.fulfillmentStatus,
        paymentStatus: o.paymentStatus,
        createdAt: o.createdAt.toISOString(),
      })),
      payments: payments.map((p) => ({
        id: p.id,
        label: p.paymentReference,
        status: p.status,
        gateway: p.gateway,
        createdAt: p.createdAt.toISOString(),
      })),
      invoices: invoices.map((i) => ({
        id: i.id,
        label: i.invoiceNumber,
        status: i.status,
        amount: i.totalAmount.toFixed(2),
        createdAt: i.createdAt.toISOString(),
      })),
      agents: agents.map((a) => ({
        id: a.id,
        label: a.companyName,
        status: a.status,
      })),
    };
  }

  async listInvoices(skip = 0, take = 25) {
    const rows = await this.invoiceService.listInvoices({ skip, take });
    return rows.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      type: i.type,
      status: i.status,
      amount: i.totalAmount.toFixed(2),
      createdAt: i.createdAt.toISOString(),
      issuedAt: i.issuedAt?.toISOString() ?? null,
    }));
  }

  getInvoice(id: string) {
    return this.invoiceService.getInvoice(id);
  }

  logActivity(
    performedBy: string,
    performedEmail: string | undefined,
    action: string,
    metadata?: Record<string, unknown>,
  ) {
    this.activityDispatcher.dispatch({
      eventType:
        action.startsWith('export') ? SystemActivityEventType.EXPORT_CSV : SystemActivityEventType.QUEUE_COMPLETED,
      eventCategory: SystemActivityEventCategory.FINANCE,
      severity: SystemActivitySeverity.INFO,
      source: SystemActivitySource.ADMIN,
      resource: 'operations_center',
      resourceId: (metadata?.orderId as string) ?? performedBy,
      title: `Operations ${action}`,
      description: `Manual operations: ${action}`,
      performedBy,
      performedEmail: performedEmail ?? null,
      metadata: { action, ...metadata },
    });
  }

  async lockOrder(orderId: string, locked: boolean, adminId: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, deletedAt: null } });
    if (!order) throw new NotFoundException('Order not found');
    const meta =
      order.invoiceMetadata && typeof order.invoiceMetadata === 'object' && !Array.isArray(order.invoiceMetadata)
        ? (order.invoiceMetadata as Record<string, unknown>)
        : {};
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        invoiceMetadata: {
          ...meta,
          operationsLocked: locked,
          operationsLockedBy: adminId,
          operationsLockedAt: new Date().toISOString(),
        },
      },
    });
    return { orderId, locked };
  }

  private async detectMismatches(query: OperationsListQuery) {
    const skip = query.skip ?? 0;
    const take = Math.min(query.take ?? 50, 100);
    const since = query.dateFrom ? new Date(query.dateFrom) : this.daysAgo(7);

    const [orders, payments, webhooks, agentOrders] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          deletedAt: null,
          createdAt: { gte: since, ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}) },
          ...(query.gateway ? { paymentGateway: query.gateway } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
        include: {
          payments: { take: 3, orderBy: { createdAt: 'desc' } },
          providerTransactions: { where: { deletedAt: null }, take: 2, orderBy: { createdAt: 'desc' } },
          orderItems: { include: { cardRecords: true } },
        },
      }),
      this.prisma.payment.findMany({
        where: { createdAt: { gte: since } },
        take: 300,
        orderBy: { createdAt: 'desc' },
        include: { order: { select: { id: true, orderCode: true, fulfillmentStatus: true } } },
      }),
      this.prisma.webhookLog.findMany({
        where: { createdAt: { gte: since } },
        take: 200,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.order.findMany({
        where: { deletedAt: null, channel: OrderChannel.AGENT, createdAt: { gte: since } },
        take: 200,
        include: { financialTransaction: true },
      }),
    ]);

    const items: Array<{
      id: string;
      type: OperationsMismatchType;
      severity: OperationsMismatchSeverity;
      orderId: string | null;
      orderCode: string | null;
      paymentReference: string | null;
      providerRef: string | null;
      description: string;
      detectedAt: string;
      gateway: string | null;
      provider: string | null;
    }> = [];

    const pendingThreshold = Date.now() - 30 * 60 * 1000;

    for (const order of orders) {
      const hasPin = order.orderItems.some((i) =>
        i.cardRecords.some((c) => c.status === CardRecordStatus.DELIVERED),
      );
      const providerTxn = order.providerTransactions[0];
      const gateway = order.paymentGateway ?? (order.channel === OrderChannel.AGENT ? 'WALLET' : null);

      if (order.paymentStatus === OrderPaymentStatus.PAID && order.fulfillmentStatus === FulfillmentStatus.PENDING && order.createdAt.getTime() < pendingThreshold) {
        items.push(this.mismatchRow('PENDING_TOO_LONG', 'HIGH', order, 'Đơn quá hạn xử lý', gateway, providerTxn?.providerReference ?? null));
      }

      if (order.fulfillmentStatus === FulfillmentStatus.COMPLETED && !hasPin && order.orderItems.some((i) => i.cardRecords.length > 0)) {
        items.push(this.mismatchRow('ORDER_NO_PIN', 'CRITICAL', order, 'Đơn hoàn tất nhưng chưa giao PIN', gateway, providerTxn?.providerReference ?? null));
      }

      if (providerTxn?.status === ProviderTransactionStatus.SUCCESS && order.fulfillmentStatus === FulfillmentStatus.FAILED) {
        items.push(this.mismatchRow('PROVIDER_SUCCESS_ORDER_FAILED', 'CRITICAL', order, 'Provider thành công nhưng đơn thất bại', gateway, providerTxn.providerReference));
      }

      if (providerTxn?.status === ProviderTransactionStatus.TIMEOUT) {
        items.push(this.mismatchRow('PROVIDER_TIMEOUT', 'HIGH', order, 'Provider timeout', gateway, providerTxn.providerReference));
      }
    }

    const paymentRefCounts = new Map<string, number>();
    for (const payment of payments) {
      if (payment.paymentReference) {
        paymentRefCounts.set(
          payment.paymentReference,
          (paymentRefCounts.get(payment.paymentReference) ?? 0) + 1,
        );
      }
    }

    for (const payment of payments) {
      if (payment.status === PaymentRecordStatus.SUCCESS && !payment.order) {
        items.push({
          id: `pay-no-order-${payment.id}`,
          type: 'PAYMENT_RECEIVED_NO_ORDER',
          severity: 'CRITICAL',
          orderId: null,
          orderCode: null,
          paymentReference: payment.paymentReference,
          providerRef: null,
          description: 'Đã nhận tiền — chưa tạo Order',
          detectedAt: payment.createdAt.toISOString(),
          gateway: payment.gateway,
          provider: null,
        });
      }
      if (payment.reconciliationStatus && payment.reconciliationStatus !== PaymentReconciliationStatus.MATCHED) {
        items.push({
          id: `pay-mismatch-${payment.id}`,
          type: 'PAYMENT_MISMATCH',
          severity: 'HIGH',
          orderId: payment.orderId,
          orderCode: payment.order?.orderCode ?? null,
          paymentReference: payment.paymentReference,
          providerRef: null,
          description: `Gateway lệch: ${payment.reconciliationStatus}`,
          detectedAt: payment.createdAt.toISOString(),
          gateway: payment.gateway,
          provider: null,
        });
      }
      if (payment.paymentReference && (paymentRefCounts.get(payment.paymentReference) ?? 0) > 1) {
        items.push({
          id: `pay-dup-${payment.id}`,
          type: 'DUPLICATE_PAYMENT',
          severity: 'HIGH',
          orderId: payment.orderId,
          orderCode: payment.order?.orderCode ?? null,
          paymentReference: payment.paymentReference,
          providerRef: null,
          description: 'Thanh toán trùng lặp',
          detectedAt: payment.createdAt.toISOString(),
          gateway: payment.gateway,
          provider: null,
        });
      }
    }

    const webhookKeys = new Map<string, number>();
    for (const wh of webhooks) {
      const key = `${wh.source}:${wh.paymentReference ?? wh.id}`;
      webhookKeys.set(key, (webhookKeys.get(key) ?? 0) + 1);
    }

    for (const wh of webhooks) {
      if (!wh.processed) {
        items.push({
          id: `wh-unproc-${wh.id}`,
          type: 'WEBHOOK_UNPROCESSED',
          severity: wh.signatureValid ? 'MEDIUM' : 'HIGH',
          orderId: null,
          orderCode: null,
          paymentReference: wh.paymentReference,
          providerRef: null,
          description: wh.signatureValid ? 'Webhook nhận — chưa xử lý' : 'Webhook chữ ký không hợp lệ',
          detectedAt: wh.createdAt.toISOString(),
          gateway: wh.source,
          provider: null,
        });
      }
      const whKey = `${wh.source}:${wh.paymentReference ?? wh.id}`;
      if ((webhookKeys.get(whKey) ?? 0) > 1) {
        items.push({
          id: `wh-dup-${wh.id}`,
          type: 'DUPLICATE_WEBHOOK',
          severity: 'MEDIUM',
          orderId: null,
          orderCode: null,
          paymentReference: wh.paymentReference,
          providerRef: null,
          description: 'Webhook trùng lặp',
          detectedAt: wh.createdAt.toISOString(),
          gateway: wh.source,
          provider: null,
        });
      }
    }

    for (const order of agentOrders) {
      if (order.fulfillmentStatus === FulfillmentStatus.COMPLETED && order.agentId) {
        const ledger = await this.prisma.ledgerEntry.findFirst({
          where: {
            agentId: order.agentId,
            referenceType: LedgerReferenceType.ORDER,
            referenceId: order.id,
            deletedAt: null,
          },
        });
        if (!ledger) {
          items.push(this.mismatchRow('PIN_DELIVERED_NO_LEDGER', 'CRITICAL', order, 'Đơn agent hoàn tất — chưa ghi Ledger', 'WALLET', null));
        }
      }
    }

    let filtered = items;
    if (query.severity) filtered = filtered.filter((i) => i.severity === query.severity);
    if (query.search?.trim()) {
      const q = query.search.trim().toLowerCase();
      filtered = filtered.filter(
        (i) =>
          i.orderCode?.toLowerCase().includes(q) ||
          i.paymentReference?.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q),
      );
    }

    const summary = {
      total: filtered.length,
      reconciled: Math.max(0, orders.length - filtered.length),
      unreconciled: filtered.length,
      mismatch: filtered.filter((i) => i.severity === 'CRITICAL' || i.severity === 'HIGH').length,
      pending: filtered.filter((i) => i.type === 'PENDING_TOO_LONG' || i.type === 'WEBHOOK_UNPROCESSED').length,
    };

    return {
      summary,
      items: filtered.slice(skip, skip + take),
      total: filtered.length,
      skip,
      take,
    };
  }

  private async detectExceptions(query: OperationsListQuery) {
    const mismatches = await this.detectMismatches({ ...query, take: 500 });
    const items = mismatches.items.map((m) => {
      const state = this.exceptionState.get(m.id);
      return {
        ...m,
        status: state?.status ?? ('OPEN' as OperationsExceptionStatus),
        assignedTo: state?.assignedTo ?? null,
        assignedEmail: state?.assignedEmail ?? null,
        notes: state?.notes ?? [],
        updatedAt: state?.updatedAt ?? m.detectedAt,
      };
    });

    let filtered = items;
    if (query.status) filtered = filtered.filter((i) => i.status === query.status);
    if (query.assignedTo) filtered = filtered.filter((i) => i.assignedTo === query.assignedTo);

    const skip = query.skip ?? 0;
    const take = Math.min(query.take ?? 25, 100);

    return {
      items: filtered.slice(skip, skip + take),
      total: filtered.length,
      skip,
      take,
    };
  }

  private mismatchRow(
    type: OperationsMismatchType,
    severity: OperationsMismatchSeverity,
    order: { id: string; orderCode: string; createdAt: Date },
    description: string,
    gateway: string | null,
    providerRef: string | null,
  ) {
    return {
      id: `${type}-${order.id}`,
      type,
      severity,
      orderId: order.id,
      orderCode: order.orderCode,
      paymentReference: null,
      providerRef,
      description,
      detectedAt: order.createdAt.toISOString(),
      gateway,
      provider: providerRef,
    };
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
