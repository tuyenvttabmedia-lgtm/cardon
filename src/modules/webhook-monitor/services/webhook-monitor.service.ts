import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  SystemActivityEventCategory,
  SystemActivityEventType,
  SystemActivitySeverity,
  SystemActivitySource,
  SystemAuditAction,
  SystemAuditResource,
  UserRole,
  WebhookLog,
  WebhookSource,
} from '@prisma/client';
import { ActivityEventDispatcher } from '../../activity-event/activity-event-dispatcher.service';
import { AuditLogService } from '../../audit-log/services/audit-log.service';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { PaymentService } from '../../payment/services/payment.service';
import { WebhookDeliveryService } from '../../webhook-delivery/services/webhook-delivery.service';
import {
  WebhookExportQueryDto,
  WebhookHistoryQueryDto,
  WebhookListQueryDto,
} from '../dto/webhook-monitor.dto';
import {
  LARGE_PAYLOAD_BYTES,
  WEBHOOK_DISPLAY_SOURCES,
  WEBHOOK_ENDPOINTS,
  WEBHOOK_MONITOR_SOURCES,
  WebhookMonitorStatus,
} from '../entities/webhook-monitor.constants';
import { WebhookMonitorRepository } from '../repositories/webhook-monitor.repository';
import {
  maskWebhookHeaders,
  maskWebhookPayload,
  payloadByteSize,
} from '../utils/webhook-payload-mask.util';
import {
  buildWebhookTimeline,
  computeSourceHealth,
  deriveHttpCode,
  deriveWebhookStatus,
  extractPayloadField,
  PaymentContext,
  webhookSourceToGateway,
} from '../utils/webhook-status.util';

export interface OperationContext {
  ipAddress?: string | null;
  userAgent?: string | null;
  sessionId?: string | null;
  correlationId?: string | null;
}

@Injectable()
export class WebhookMonitorService {
  private lastAlertAt = 0;

  constructor(
    private readonly repository: WebhookMonitorRepository,
    private readonly paymentService: PaymentService,
    private readonly webhookDeliveryService: WebhookDeliveryService,
    private readonly activityDispatcher: ActivityEventDispatcher,
    private readonly auditLogService: AuditLogService,
  ) {}

  async list(query: WebhookListQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [rows, totalRaw] = await Promise.all([
      this.repository.findMany(query, skip, limit * 3),
      this.repository.count(query),
    ]);

    const enriched = await this.enrichRows(rows);
    let filtered = enriched;

    if (query.status) {
      filtered = filtered.filter((r) => r.status === query.status);
    }
    if (query.http_code) {
      filtered = filtered.filter((r) => r.httpCode === query.http_code);
    }
    if (query.order_id?.trim()) {
      const needle = query.order_id.trim().toLowerCase();
      filtered = filtered.filter((r) => (r.orderId ?? '').toLowerCase().includes(needle));
    }
    if (query.payment_id?.trim()) {
      const needle = query.payment_id.trim().toLowerCase();
      filtered = filtered.filter((r) => (r.paymentId ?? '').toLowerCase().includes(needle));
    }
    if (query.correlation_id?.trim()) {
      const needle = query.correlation_id.trim().toLowerCase();
      filtered = filtered.filter((r) => (r.correlationId ?? '').toLowerCase().includes(needle));
    }
    if (query.request_id?.trim()) {
      const needle = query.request_id.trim().toLowerCase();
      filtered = filtered.filter((r) => (r.requestId ?? '').toLowerCase().includes(needle));
    }
    if (query.endpoint?.trim()) {
      const needle = query.endpoint.trim().toLowerCase();
      filtered = filtered.filter((r) => r.endpoint.toLowerCase().includes(needle));
    }
    if (query.keyword?.trim()) {
      const needle = query.keyword.trim().toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.paymentReference.toLowerCase().includes(needle) ||
          (r.orderId ?? '').toLowerCase().includes(needle) ||
          (r.paymentId ?? '').toLowerCase().includes(needle),
      );
    }

    const items = filtered.slice(0, limit);
    const dashboard = await this.buildDashboard();
    await this.checkAlerts(dashboard.summary);

    return {
      summary: dashboard.summary,
      sources: dashboard.sources,
      items,
      total: query.status || query.http_code ? filtered.length : totalRaw,
      page,
      limit,
    };
  }

  async getById(id: string) {
    const log = await this.repository.findById(id);
    if (!log) throw new NotFoundException('Webhook not found');
    const [row] = await this.enrichRows([log]);
    const payload = maskWebhookPayload(log.payload);
    const payloadSize = payloadByteSize(log.payload);
    const retryHistory = await this.buildRetryHistory(log);

    return {
      ...row,
      payload,
      payloadCollapsed: payloadSize > LARGE_PAYLOAD_BYTES,
      payloadSizeBytes: payloadSize,
      headers: maskWebhookHeaders(this.inferHeaders(log)),
      response: {
        httpCode: row.httpCode,
        body: { ok: row.status === 'SUCCESS' || row.status === 'DUPLICATE' },
        durationMs: row.durationMs,
        worker: null,
        queue: row.status === 'PENDING' ? 'payment_queue' : null,
      },
      timeline: buildWebhookTimeline(row.status, log.createdAt, log.retryCount),
      retryHistory,
      metadata: log.monitorMetadata ?? {},
      signature: {
        verified: log.signatureValid,
        invalid: !log.signatureValid,
        badge: !log.signatureValid ? 'Invalid' : 'Verified',
      },
    };
  }

  async getStatistics(source?: WebhookSource) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await this.repository.findSince(since, source);
    const enriched = await this.enrichRows(rows);

    const total = enriched.length;
    const success = enriched.filter((r) => r.status === 'SUCCESS').length;
    const failed = enriched.filter((r) => r.status === 'FAILED').length;
    const pending = enriched.filter((r) => r.status === 'PENDING' || r.status === 'RETRY').length;
    const duplicate = enriched.filter((r) => r.status === 'DUPLICATE').length;
    const invalidSignature = enriched.filter((r) => r.status === 'INVALID_SIGNATURE').length;
    const timeout = enriched.filter((r) => r.status === 'TIMEOUT').length;
    const retry = enriched.reduce((s, r) => s + r.retry, 0);

    const hourMs = 60 * 60 * 1000;
    const minuteMs = 60_000;
    const now = Date.now();
    const completed = enriched.filter((r) => r.status === 'SUCCESS' || r.status === 'FAILED');
    const perHour = completed.filter((r) => now - new Date(r.createdAt).getTime() < hourMs).length;
    const perMinute = completed.filter((r) => now - new Date(r.createdAt).getTime() < minuteMs).length;

    const durations = enriched.map((r) => r.durationMs).filter((d): d is number => d != null);
    const avgDuration =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null;

    const done = success + failed;
    return {
      total,
      success,
      failed,
      pending,
      duplicate,
      invalidSignature,
      timeout,
      retry,
      webhooksPerMinute: perMinute,
      webhooksPerHour: perHour,
      avgDurationMs: avgDuration,
      retryRate: done > 0 ? Math.round((retry / done) * 10000) / 100 : 0,
      failureRate: done > 0 ? Math.round((failed / done) * 10000) / 100 : 0,
      duplicateRate: total > 0 ? Math.round((duplicate / total) * 10000) / 100 : 0,
      signatureFailRate: total > 0 ? Math.round((invalidSignature / total) * 10000) / 100 : 0,
      hourly: this.buildHourlyChart(enriched),
    };
  }

  async getHistory(query: WebhookHistoryQueryDto) {
    const { from, to } = this.resolveRange(query);
    const rows = await this.repository.findSince(new Date(from), query.source);
    const enriched = (await this.enrichRows(rows)).filter((r) => {
      const t = new Date(r.createdAt).getTime();
      return t >= from && t <= to;
    });
    return {
      range: query.range ?? '24h',
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
      buckets: this.buildHistoryBuckets(enriched, from, to),
    };
  }

  async retryWebhook(id: string, user: AuthenticatedUser, ctx: OperationContext) {
    const log = await this.requireRetryable(id);
    if (log.source === WebhookSource.PARTNER) {
      await this.webhookDeliveryService.adminRetryDelivery(id);
      this.logManage(user, ctx, 'retry', id, { source: log.source, direction: 'outbound' });
      return { ok: true };
    }
    const gateway = webhookSourceToGateway(log.source);
    try {
      await this.paymentService.handleWebhook(
        gateway,
        log.payload,
        {},
        log.ipAddress ?? undefined,
      );
    } catch (err) {
      this.dispatchWebhookFailed(log, err);
      throw err;
    }
    await this.repository.incrementRetry(id);
    this.logManage(user, ctx, 'retry', id, { source: log.source });
    return { ok: true };
  }

  async retryFailed(user: AuthenticatedUser, ctx: OperationContext, ids?: string[]) {
    const rows = ids?.length
      ? await Promise.all(ids.map((id) => this.requireRetryable(id)))
      : await this.repository.findRetryable();
    let retried = 0;
    for (const log of rows) {
      try {
        await this.retryWebhook(log.id, user, ctx);
        retried += 1;
      } catch {
        // continue
      }
    }
    return { ok: true, retried };
  }

  async cancelWebhooks(ids: string[], user: AuthenticatedUser, ctx: OperationContext) {
    const result = await this.repository.cancelMany(ids);
    this.logManage(user, ctx, 'cancel', ids.join(','), { cancelled: result.count });
    return { ok: true, cancelled: result.count };
  }

  async exportData(query: WebhookExportQueryDto) {
    const list = await this.list({
      ...query,
      page: 1,
      limit: 500,
    });
    if (query.type === 'statistics') {
      const stats = await this.getStatistics(query.source);
      return { kind: 'statistics' as const, data: stats };
    }
    if (query.type === 'history') {
      const history = await this.getHistory(query);
      return { kind: 'history' as const, data: history };
    }
    return { kind: 'webhooks' as const, data: list.items };
  }

  private async buildDashboard() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [todayRows, last24hRows] = await Promise.all([
      this.repository.findSince(startOfToday),
      this.repository.findSince(since24h),
    ]);

    const today = await this.enrichRows(todayRows);
    const last24h = await this.enrichRows(last24hRows);

    const summary = {
      totalToday: today.length,
      success: today.filter((r) => r.status === 'SUCCESS').length,
      failed: today.filter((r) => r.status === 'FAILED').length,
      pending: today.filter((r) => r.status === 'PENDING' || r.status === 'RETRY').length,
      duplicate: today.filter((r) => r.status === 'DUPLICATE').length,
      invalidSignature: today.filter((r) => r.status === 'INVALID_SIGNATURE').length,
      retryQueue: today.filter((r) => r.status === 'RETRY' || (r.status === 'PENDING' && r.retry > 0)).length,
      avgResponseTimeMs: this.avgDuration(today),
      last24Hours: last24h.length,
    };

    const sources = await Promise.all(
      WEBHOOK_MONITOR_SOURCES.map(async (source) => {
        const sourceToday = today.filter((r) => r.source === source);
        const last = sourceToday[0]?.createdAt ?? null;
        const health = computeSourceHealth({
          total: sourceToday.length,
          failed: sourceToday.filter((r) => r.status === 'FAILED').length,
          invalidSignature: sourceToday.filter((r) => r.status === 'INVALID_SIGNATURE').length,
          timeout: sourceToday.filter((r) => r.status === 'TIMEOUT').length,
          lastReceivedAt: last ? new Date(last) : null,
        });
        return {
          source,
          displayName: WEBHOOK_DISPLAY_SOURCES[source],
          health,
          today: sourceToday.length,
          success: sourceToday.filter((r) => r.status === 'SUCCESS').length,
          failed: sourceToday.filter((r) => r.status === 'FAILED').length,
          retry: sourceToday.reduce((s, r) => s + r.retry, 0),
          avgResponseTimeMs: this.avgDuration(sourceToday),
          lastReceivedAt: last,
        };
      }),
    );

    return { summary, sources };
  }

  private async enrichRows(logs: WebhookLog[]) {
    const refs = [...new Set(logs.map((l) => l.paymentReference))];
    const [payments, allForDup] = await Promise.all([
      this.repository.findPaymentsByReferences(refs),
      this.repository.findByPaymentReferences(refs),
    ]);

    const paymentByRef = new Map(payments.map((p) => [p.paymentReference, p]));
    const firstIdByRef = new Map<string, string>();
    for (const row of allForDup) {
      if (!firstIdByRef.has(row.paymentReference)) {
        firstIdByRef.set(row.paymentReference, row.id);
      }
    }

    return logs.map((log) => {
      const payment = paymentByRef.get(log.paymentReference) ?? null;
      const isDuplicate = firstIdByRef.get(log.paymentReference) !== log.id;
      const status = deriveWebhookStatus(log, payment as PaymentContext | null, isDuplicate);
      const meta = (log.monitorMetadata as Record<string, unknown>) ?? {};
      const partnerMeta = meta as { destinationUrl?: string; orderId?: string };
      const isOutboundPartner = log.source === WebhookSource.PARTNER && meta.direction === 'outbound';

      return {
        id: log.id,
        createdAt: log.createdAt.toISOString(),
        source: log.source,
        displayName: WEBHOOK_DISPLAY_SOURCES[log.source],
        endpoint: isOutboundPartner
          ? (partnerMeta.destinationUrl ?? WEBHOOK_ENDPOINTS[log.source])
          : WEBHOOK_ENDPOINTS[log.source],
        method: 'POST',
        status,
        httpCode: isOutboundPartner
          ? (typeof meta.httpStatus === 'number' ? meta.httpStatus : deriveHttpCode(status))
          : deriveHttpCode(status),
        durationMs: typeof meta.durationMs === 'number' ? meta.durationMs : (typeof meta.latencyMs === 'number' ? meta.latencyMs : null),
        signatureValid: log.signatureValid,
        retry: log.retryCount,
        correlationId: extractPayloadField(log.payload, 'correlationId', 'correlation_id') ??
          (typeof meta.correlationId === 'string' ? meta.correlationId : null),
        requestId: extractPayloadField(log.payload, 'requestId', 'request_id'),
        orderId: payment?.orderId ?? partnerMeta.orderId ?? extractPayloadField(log.payload, 'orderId', 'order_id'),
        paymentId: payment?.id ?? extractPayloadField(log.payload, 'paymentId', 'payment_id'),
        paymentReference: log.paymentReference,
        provider: payment?.gateway ?? WEBHOOK_DISPLAY_SOURCES[log.source],
        ipAddress: log.ipAddress,
        cancelled: Boolean(log.cancelledAt),
      };
    });
  }

  private async buildRetryHistory(log: WebhookLog) {
    const siblings = await this.repository.findByPaymentReferences([log.paymentReference]);
    return siblings
      .filter((s) => s.id !== log.id)
      .map((s, i) => ({
        attempt: i + 1,
        time: s.createdAt.toISOString(),
        httpCode: 200,
        durationMs: null,
        worker: null,
        webhookId: s.id,
      }));
  }

  private inferHeaders(log: WebhookLog): Record<string, string> {
    const meta = (log.monitorMetadata as Record<string, unknown>) ?? {};
    if (meta.headers && typeof meta.headers === 'object') {
      return meta.headers as Record<string, string>;
    }
    return {
      'content-type': 'application/json',
      'x-forwarded-for': log.ipAddress ?? '',
    };
  }

  private avgDuration(rows: Array<{ durationMs: number | null }>) {
    const vals = rows.map((r) => r.durationMs).filter((d): d is number => d != null);
    return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  }

  private buildHourlyChart(rows: Array<{ createdAt: string; status: WebhookMonitorStatus }>) {
    const buckets: Record<string, { hour: string; success: number; failed: number; retry: number; timeout: number; duplicate: number }> = {};
    const now = Date.now();
    for (let i = 23; i >= 0; i -= 1) {
      const t = new Date(now - i * 60 * 60 * 1000);
      const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}T${String(t.getHours()).padStart(2, '0')}:00`;
      buckets[key] = { hour: key, success: 0, failed: 0, retry: 0, timeout: 0, duplicate: 0 };
    }
    for (const row of rows) {
      const t = new Date(row.createdAt);
      const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}T${String(t.getHours()).padStart(2, '0')}:00`;
      if (!buckets[key]) continue;
      if (row.status === 'SUCCESS') buckets[key].success += 1;
      else if (row.status === 'FAILED') buckets[key].failed += 1;
      else if (row.status === 'RETRY') buckets[key].retry += 1;
      else if (row.status === 'TIMEOUT') buckets[key].timeout += 1;
      else if (row.status === 'DUPLICATE') buckets[key].duplicate += 1;
    }
    return Object.values(buckets);
  }

  private buildHistoryBuckets(
    rows: Array<{ createdAt: string; status: WebhookMonitorStatus }>,
    from: number,
    to: number,
  ) {
    const span = to - from;
    const bucketMs = span > 3 * 24 * 60 * 60 * 1000 ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
    const buckets: Record<string, { label: string; success: number; failed: number; retry: number; timeout: number; duplicate: number }> = {};
    for (let t = from; t <= to; t += bucketMs) {
      const key = String(Math.floor(t / bucketMs));
      buckets[key] = {
        label: new Date(t).toISOString(),
        success: 0,
        failed: 0,
        retry: 0,
        timeout: 0,
        duplicate: 0,
      };
    }
    for (const row of rows) {
      const ts = new Date(row.createdAt).getTime();
      const key = String(Math.floor(ts / bucketMs));
      if (!buckets[key]) continue;
      if (row.status === 'SUCCESS') buckets[key].success += 1;
      else if (row.status === 'FAILED') buckets[key].failed += 1;
      else if (row.status === 'RETRY') buckets[key].retry += 1;
      else if (row.status === 'TIMEOUT') buckets[key].timeout += 1;
      else if (row.status === 'DUPLICATE') buckets[key].duplicate += 1;
    }
    return Object.values(buckets);
  }

  private resolveRange(query: WebhookHistoryQueryDto) {
    const now = Date.now();
    let from = now - 24 * 60 * 60 * 1000;
    let to = now;
    if (query.range === '7d') from = now - 7 * 24 * 60 * 60 * 1000;
    if (query.range === '30d') from = now - 30 * 24 * 60 * 60 * 1000;
    if (query.range === 'custom') {
      if (query.date_from) from = new Date(query.date_from).getTime();
      if (query.date_to) {
        const end = new Date(query.date_to);
        end.setHours(23, 59, 59, 999);
        to = end.getTime();
      }
    }
    return { from, to };
  }

  private async requireRetryable(id: string) {
    const log = await this.repository.findById(id);
    if (!log) throw new NotFoundException('Webhook not found');
    if (log.cancelledAt) throw new BadRequestException('Webhook cancelled');

    const meta = (log.monitorMetadata ?? {}) as Record<string, unknown>;
    if (log.source === WebhookSource.PARTNER && meta.direction === 'outbound') {
      if (meta.deliveryStatus === 'Delivered') {
        throw new BadRequestException('Webhook already delivered');
      }
      return log;
    }

    if (!log.signatureValid) throw new BadRequestException('Cannot retry invalid signature');
    if (log.source !== WebhookSource.MEGAPAY && log.source !== WebhookSource.SEPAY) {
      throw new BadRequestException('Retry only supported for payment webhooks');
    }
    return log;
  }

  private async checkAlerts(summary: {
    failed: number;
    invalidSignature: number;
    pending: number;
  }) {
    const now = Date.now();
    if (now - this.lastAlertAt < 60_000) return;
    this.lastAlertAt = now;

    const dispatch = (title: string, description: string, severity: SystemActivitySeverity, metadata: Record<string, unknown>) => {
      this.activityDispatcher.dispatch({
        eventType: SystemActivityEventType.WEBHOOK_FAILED,
        eventCategory: SystemActivityEventCategory.WEBHOOK,
        severity,
        source: SystemActivitySource.SYSTEM,
        resource: 'webhook',
        title,
        description,
        metadata,
      });
    };

    if (summary.invalidSignature > 0) {
      dispatch('Invalid Webhook Signature', `${summary.invalidSignature} invalid signatures today`, SystemActivitySeverity.CRITICAL, { alert: 'invalid_signature' });
    }
    if (summary.failed > 5) {
      dispatch('Webhook Failed Spike', `${summary.failed} failed webhooks today`, SystemActivitySeverity.WARNING, { alert: 'failed_spike' });
    }
    if (summary.pending > 10) {
      dispatch('Webhook Pending Queue', `${summary.pending} pending webhooks`, SystemActivitySeverity.WARNING, { alert: 'pending_high' });
    }
  }

  private dispatchWebhookFailed(log: WebhookLog, err: unknown) {
    this.activityDispatcher.dispatch({
      eventType: SystemActivityEventType.WEBHOOK_FAILED,
      eventCategory: SystemActivityEventCategory.WEBHOOK,
      severity: SystemActivitySeverity.ERROR,
      source: SystemActivitySource.ADMIN,
      resource: 'webhook',
      resourceId: log.id,
      title: 'Webhook Retry Failed',
      description: err instanceof Error ? err.message : String(err),
      metadata: { paymentReference: log.paymentReference },
    });
  }

  logActivityCopy(user: AuthenticatedUser, ctx: OperationContext, action: string, webhookId: string) {
    this.activityDispatcher.dispatch({
      eventType: SystemActivityEventType.EXPORT_CSV,
      eventCategory: SystemActivityEventCategory.WEBHOOK,
      severity: SystemActivitySeverity.INFO,
      source: SystemActivitySource.ADMIN,
      resource: 'webhook',
      resourceId: webhookId,
      title: `Webhook ${action}`,
      description: action,
      performedBy: user.id,
      performedEmail: user.email,
      performedRole: user.role,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
      correlationId: ctx.correlationId ?? null,
      metadata: { action },
    });
  }

  private logManage(
    user: AuthenticatedUser,
    ctx: OperationContext,
    operation: string,
    resourceId: string,
    metadata?: Record<string, unknown>,
  ) {
    this.activityDispatcher.dispatch({
      eventType: SystemActivityEventType.WEBHOOK_RECEIVED,
      eventCategory: SystemActivityEventCategory.WEBHOOK,
      severity: SystemActivitySeverity.INFO,
      source: SystemActivitySource.ADMIN,
      resource: 'webhook',
      resourceId,
      title: `Webhook ${operation}`,
      description: `${operation} webhook ${resourceId}`,
      performedBy: user.id,
      performedEmail: user.email,
      performedRole: user.role,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
      correlationId: ctx.correlationId ?? null,
      metadata: { operation, ...metadata },
    });

    const auditAction =
      operation === 'cancel' ? SystemAuditAction.DELETE : SystemAuditAction.UPDATE;
    this.auditLogService.create({
      resource: SystemAuditResource.SYSTEM,
      resourceId,
      resourceName: 'webhook',
      action: auditAction,
      fieldName: operation,
      oldValue: null,
      newValue: metadata ?? { operation },
      performedBy: user.id,
      performedEmail: user.email,
      performedRole: user.role as UserRole,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
      sessionId: ctx.sessionId ?? null,
      correlationId: ctx.correlationId ?? null,
      reason: `Webhook monitor: ${operation}`,
    });
  }
}
