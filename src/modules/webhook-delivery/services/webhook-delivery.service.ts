import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SystemActivityEventCategory,
  SystemActivityEventType,
  SystemActivitySeverity,
  SystemActivitySource,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { ActivityEventDispatcher } from '../../activity-event/activity-event-dispatcher.service';
import { AgentCredentialService } from '../../agent/services/agent-credential.service';
import { AgentRepository } from '../../agent/repositories/agent.repository';
import { AgentPlatformRole } from '../../agent-platform/entities/agent-platform.constants';
import { NotificationService } from '../../notification/services/notification.service';
import {
  WEBHOOK_DELIVERY_MAX_ATTEMPTS,
  WEBHOOK_DELIVERY_STATUS,
  WebhookDeliveryStatus,
} from '../entities/webhook-delivery.constants';
import {
  WebhookDeliveryMonitorMetadata,
  WebhookDeliveryTimelineEntry,
} from '../entities/webhook-delivery.types';
import { WebhookDeliveryRepository } from '../repositories/webhook-delivery.repository';
import { maskDeliveryPayload, truncateBody } from '../utils/webhook-delivery-mask.util';
import {
  maskSignature,
  signWebhookBody,
} from '../utils/webhook-delivery-signature.util';
import { assertValidWebhookDestination } from '../utils/webhook-delivery-url.util';
import { WebhookDeliveryPayloadService } from './webhook-delivery-payload.service';
import { WebhookDeliveryProducer } from './webhook-delivery-producer.service';

@Injectable()
export class WebhookDeliveryService {
  private readonly logger = new Logger(WebhookDeliveryService.name);

  constructor(
    private readonly repository: WebhookDeliveryRepository,
    private readonly payloadService: WebhookDeliveryPayloadService,
    private readonly producer: WebhookDeliveryProducer,
    private readonly agentRepository: AgentRepository,
    private readonly credentialService: AgentCredentialService,
    private readonly notificationService: NotificationService,
    private readonly activityDispatcher: ActivityEventDispatcher,
    private readonly prisma: PrismaService,
  ) {}

  scheduleForOrder(orderId: string): void {
    void this.enqueueForOrder(orderId).catch((err) => {
      this.logger.warn(
        `scheduleForOrder failed orderId=${orderId}: ${err instanceof Error ? err.message : err}`,
      );
    });
  }

  async enqueueForOrder(orderId: string): Promise<string | null> {
    const event = await this.payloadService.resolveEvent(orderId);
    if (!event) return null;

    const dbOrder = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { agentId: true },
    });
    if (!dbOrder?.agentId) return null;

    const webhookConfig = await this.prisma.agentWebhookConfig.findUnique({
      where: { agentId: dbOrder.agentId },
    });
    if (!webhookConfig?.enabled || !webhookConfig.callbackUrl) {
      return null;
    }

    const events = Array.isArray(webhookConfig.events)
      ? (webhookConfig.events as string[])
      : ['order.completed', 'order.failed'];
    if (!events.includes(event)) return null;

    const reference = this.repository.deliveryReference(orderId, event);
    const existing = await this.repository.findByReference(reference);
    if (existing && !existing.cancelledAt) {
      return existing.id;
    }

    const body = await this.payloadService.buildPayload(orderId, event);
    if (!body) return null;

    assertValidWebhookDestination(webhookConfig.callbackUrl);

    const now = new Date().toISOString();
    const metadata: WebhookDeliveryMonitorMetadata = {
      direction: 'outbound',
      deliveryStatus: WEBHOOK_DELIVERY_STATUS.PENDING,
      agentId: dbOrder.agentId,
      orderId,
      requestId: body.request_id,
      partnerOrderId: body.partner_order_id,
      destinationUrl: webhookConfig.callbackUrl,
      event,
      version: body.version,
      httpStatus: null,
      latencyMs: null,
      lastError: null,
      timeline: [{ at: now, status: WEBHOOK_DELIVERY_STATUS.PENDING, detail: 'Đã tạo job giao webhook' }],
      gateway: body.gateway ?? null,
      provider: body.provider ?? null,
    };

    const log = await this.repository.createDelivery({
      paymentReference: reference,
      payload: body as unknown as Prisma.InputJsonValue,
      monitorMetadata: metadata,
    });

    await this.producer.enqueueSend(log.id);
    return log.id;
  }

  async processDelivery(deliveryId: string, attemptNumber: number): Promise<void> {
    const log = await this.repository.findById(deliveryId);
    if (!log) return;

    const meta = this.repository.getMetadata(log);
    if (meta.direction !== 'outbound') return;
    if (meta.deliveryStatus === WEBHOOK_DELIVERY_STATUS.CANCELLED || log.cancelledAt) return;
    if (meta.deliveryStatus === WEBHOOK_DELIVERY_STATUS.DELIVERED && log.processed) return;

    const webhookConfig = await this.prisma.agentWebhookConfig.findUnique({
      where: { agentId: meta.agentId },
    });
    if (!webhookConfig?.enabled || !webhookConfig.callbackUrl || !webhookConfig.secretEncrypted) {
      await this.markDeadLetter(log.id, meta, 'Webhook đã tắt hoặc thiếu secret');
      await this.notifyDisabled(meta.agentId, deliveryId);
      return;
    }

    const rawBody = JSON.stringify(log.payload);
    if (Buffer.byteLength(rawBody, 'utf8') > 256 * 1024) {
      await this.markDeadLetter(log.id, meta, 'Payload vượt 256KB');
      return;
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const secret = this.credentialService.decryptSecretKey(webhookConfig.secretEncrypted);
    const signature = signWebhookBody(secret, timestamp, rawBody);

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-CardOn-Signature': signature,
      'X-CardOn-Timestamp': timestamp,
      'X-CardOn-Event': meta.event,
      'X-CardOn-Version': meta.version,
      'User-Agent': 'CardOn-Webhook/1.0',
    };

    const sendingMeta = this.appendTimeline(meta, {
      at: new Date().toISOString(),
      status: attemptNumber > 1 ? WEBHOOK_DELIVERY_STATUS.RETRYING : WEBHOOK_DELIVERY_STATUS.SENDING,
      attempt: attemptNumber,
      detail: `Gửi lần ${attemptNumber}`,
    });
    sendingMeta.deliveryStatus =
      attemptNumber > 1 ? WEBHOOK_DELIVERY_STATUS.RETRYING : WEBHOOK_DELIVERY_STATUS.SENDING;
    sendingMeta.requestHeaders = {
      ...requestHeaders,
      'X-CardOn-Signature': maskSignature(signature),
    };
    sendingMeta.signatureMasked = maskSignature(signature);

    await this.repository.updateDelivery(log.id, { monitorMetadata: sendingMeta });

    const started = Date.now();
    let httpStatus: number | null = null;
    let responseBody: string | null = null;
    let responseHeaders: Record<string, string> = {};
    let lastError: string | null = null;

    try {
      assertValidWebhookDestination(webhookConfig.callbackUrl);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);
      const res = await fetch(webhookConfig.callbackUrl, {
        method: 'POST',
        headers: requestHeaders,
        body: rawBody,
        signal: controller.signal,
      });
      clearTimeout(timer);
      httpStatus = res.status;
      responseBody = truncateBody(await res.text());
      res.headers.forEach((v, k) => {
        responseHeaders[k] = v;
      });

      if (res.ok) {
        const delivered = this.appendTimeline(sendingMeta, {
          at: new Date().toISOString(),
          status: WEBHOOK_DELIVERY_STATUS.DELIVERED,
          httpStatus,
          detail: 'Giao webhook thành công',
        });
        delivered.deliveryStatus = WEBHOOK_DELIVERY_STATUS.DELIVERED;
        delivered.httpStatus = httpStatus;
        delivered.latencyMs = Date.now() - started;
        delivered.responseHeaders = responseHeaders;
        delivered.responseBody = responseBody;
        delivered.lastError = null;

        await this.repository.updateDelivery(log.id, {
          processed: true,
          retryCount: attemptNumber - 1,
          monitorMetadata: delivered,
        });

        if (attemptNumber > 1) {
          await this.notifyRetrySuccess(meta.agentId, deliveryId, meta.orderId);
        }
        return;
      }

      lastError = `HTTP ${httpStatus}`;
    } catch (err) {
      lastError =
        err instanceof Error && err.name === 'AbortError'
          ? 'Timeout sau 5 giây'
          : err instanceof Error
            ? err.message
            : 'Gửi webhook thất bại';
      httpStatus = null;
    }

    const failedMeta = this.appendTimeline(sendingMeta, {
      at: new Date().toISOString(),
      status:
        attemptNumber >= WEBHOOK_DELIVERY_MAX_ATTEMPTS
          ? WEBHOOK_DELIVERY_STATUS.DEAD_LETTER
          : WEBHOOK_DELIVERY_STATUS.FAILED,
      httpStatus,
      detail: lastError ?? undefined,
    });
    failedMeta.httpStatus = httpStatus;
    failedMeta.latencyMs = Date.now() - started;
    failedMeta.lastError = lastError;
    failedMeta.responseHeaders = responseHeaders;
    failedMeta.responseBody = responseBody;

    if (attemptNumber >= WEBHOOK_DELIVERY_MAX_ATTEMPTS) {
      failedMeta.deliveryStatus = WEBHOOK_DELIVERY_STATUS.DEAD_LETTER;
      await this.repository.updateDelivery(log.id, {
        processed: true,
        retryCount: attemptNumber - 1,
        monitorMetadata: failedMeta,
      });
      await this.notifyDeadLetter(meta.agentId, deliveryId, meta.orderId, lastError);
      return;
    }

    failedMeta.deliveryStatus = WEBHOOK_DELIVERY_STATUS.FAILED;
    await this.repository.updateDelivery(log.id, {
      processed: false,
      retryCount: attemptNumber - 1,
      monitorMetadata: failedMeta,
    });

    if (attemptNumber === 1) {
      await this.notifyFailed(meta.agentId, deliveryId, meta.orderId, lastError);
    }

    throw new Error(lastError ?? 'Webhook delivery failed');
  }

  async retryDelivery(deliveryId: string, userId: string, role: AgentPlatformRole): Promise<{ ok: true }> {
    if (role !== 'OWNER') {
      throw new ForbiddenException('Chỉ Owner mới được thử giao lại webhook');
    }
    const agent = await this.agentRepository.findByUserId(userId);
    if (!agent) throw new NotFoundException('Agent not found');

    const log = await this.repository.findByIdForAgent(deliveryId, agent.id);
    if (!log) throw new NotFoundException('Webhook delivery not found');

    const meta = this.repository.getMetadata(log);
    if (meta.deliveryStatus === WEBHOOK_DELIVERY_STATUS.DELIVERED) {
      throw new BadRequestException('Webhook đã giao thành công');
    }
    if (log.cancelledAt) {
      throw new BadRequestException('Webhook đã bị huỷ');
    }

    await this.resetForManualRetry(log.id, meta, 'Owner yêu cầu thử giao lại');
    this.logActivity(userId, deliveryId, 'Thử giao lại webhook', SystemActivityEventType.QUEUE_RETRY);
    await this.producer.enqueueSend(deliveryId, true);
    return { ok: true };
  }

  async cancelDelivery(deliveryId: string, userId: string, role: AgentPlatformRole): Promise<{ ok: true }> {
    if (role !== 'OWNER') {
      throw new ForbiddenException('Chỉ Owner mới được huỷ webhook');
    }
    const agent = await this.agentRepository.findByUserId(userId);
    if (!agent) throw new NotFoundException('Agent not found');

    const log = await this.repository.findByIdForAgent(deliveryId, agent.id);
    if (!log) throw new NotFoundException('Webhook delivery not found');

    const meta = this.repository.getMetadata(log);
    const cancelled = this.appendTimeline(meta, {
      at: new Date().toISOString(),
      status: WEBHOOK_DELIVERY_STATUS.CANCELLED,
      detail: 'Huỷ thủ công bởi Owner',
    });
    cancelled.deliveryStatus = WEBHOOK_DELIVERY_STATUS.CANCELLED;

    await this.repository.updateDelivery(log.id, {
      cancelledAt: new Date(),
      processed: true,
      monitorMetadata: cancelled,
    });

    this.logActivity(userId, deliveryId, 'Huỷ giao webhook', SystemActivityEventType.WEBHOOK_FAILED);
    return { ok: true };
  }

  async listDeliveries(
    userId: string,
    query: {
      page?: number;
      limit?: number;
      status?: WebhookDeliveryStatus;
      event?: string;
      search?: string;
      httpStatus?: number;
      tab?: 'history' | 'failed' | 'retry';
      gateway?: string;
      provider?: string;
      dateFrom?: string;
      dateTo?: string;
    },
  ) {
    const agent = await this.agentRepository.findByUserId(userId);
    if (!agent) throw new NotFoundException('Agent not found');

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    let status = query.status;
    if (query.tab === 'failed') status = WEBHOOK_DELIVERY_STATUS.DEAD_LETTER;
    if (query.tab === 'retry') status = WEBHOOK_DELIVERY_STATUS.RETRYING;

    const listQuery = {
      skip,
      take: limit,
      status,
      event: query.event,
      search: query.search,
      httpStatus: query.httpStatus,
      gateway: query.gateway,
      provider: query.provider,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
    };

    const [items, total] = await Promise.all([
      this.repository.listForAgent(agent.id, listQuery),
      this.repository.countForAgent(agent.id, listQuery),
    ]);

    return {
      items: items.map((row) => this.mapListItem(row)),
      page,
      limit,
      total,
    };
  }

  async getDelivery(deliveryId: string, userId: string, role: AgentPlatformRole) {
    const agent = await this.agentRepository.findByUserId(userId);
    if (!agent) throw new NotFoundException('Agent not found');

    const log = await this.repository.findByIdForAgent(deliveryId, agent.id);
    if (!log) throw new NotFoundException('Webhook delivery not found');

    const meta = this.repository.getMetadata(log);
    this.logActivity(userId, deliveryId, 'Xem chi tiết giao webhook', SystemActivityEventType.WEBHOOK_RECEIVED);

    return {
      ...this.mapListItem(log),
      payload: maskDeliveryPayload(log.payload),
      rawPayload: role === 'OWNER' ? log.payload : maskDeliveryPayload(log.payload),
      requestUrl: meta.destinationUrl,
      requestHeaders: meta.requestHeaders ?? {},
      responseHeaders: meta.responseHeaders ?? {},
      responseBody: meta.responseBody ?? null,
      signature: meta.signatureMasked ?? null,
      timeline: meta.timeline ?? [],
      canRetry:
        role === 'OWNER' &&
        meta.deliveryStatus !== WEBHOOK_DELIVERY_STATUS.DELIVERED &&
        !log.cancelledAt,
      canCancel:
        role === 'OWNER' &&
        meta.deliveryStatus !== WEBHOOK_DELIVERY_STATUS.DELIVERED &&
        !log.cancelledAt,
    };
  }

  async getStatistics(userId: string) {
    const agent = await this.agentRepository.findByUserId(userId);
    if (!agent) throw new NotFoundException('Agent not found');

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await this.repository.statsForAgent(agent.id, since);

    let delivered = 0;
    let failed = 0;
    let pending = 0;
    let deadLetter = 0;
    let retrying = 0;

    for (const row of rows) {
      const meta = (row.monitorMetadata ?? {}) as unknown as WebhookDeliveryMonitorMetadata;
      const st = meta.deliveryStatus;
      if (st === WEBHOOK_DELIVERY_STATUS.DELIVERED) delivered += 1;
      else if (st === WEBHOOK_DELIVERY_STATUS.DEAD_LETTER) deadLetter += 1;
      else if (st === WEBHOOK_DELIVERY_STATUS.RETRYING) retrying += 1;
      else if (st === WEBHOOK_DELIVERY_STATUS.PENDING || st === WEBHOOK_DELIVERY_STATUS.SENDING) pending += 1;
      else failed += 1;
    }

    return {
      period: '24h',
      total: rows.length,
      delivered,
      failed,
      pending,
      deadLetter,
      retrying,
      successRate: rows.length > 0 ? Math.round((delivered / rows.length) * 10000) / 100 : 0,
    };
  }

  async adminRetryDelivery(deliveryId: string): Promise<{ ok: true }> {
    const log = await this.repository.findById(deliveryId);
    if (!log) throw new NotFoundException('Webhook not found');

    const meta = this.repository.getMetadata(log);
    await this.resetForManualRetry(log.id, meta, 'Admin yêu cầu thử giao lại');
    await this.producer.enqueueSend(deliveryId, true);
    return { ok: true };
  }

  private async resetForManualRetry(
    id: string,
    meta: WebhookDeliveryMonitorMetadata,
    detail: string,
  ) {
    const reset = this.appendTimeline(meta, {
      at: new Date().toISOString(),
      status: WEBHOOK_DELIVERY_STATUS.PENDING,
      detail,
    });
    reset.deliveryStatus = WEBHOOK_DELIVERY_STATUS.PENDING;
    reset.lastError = null;
    await this.repository.updateDelivery(id, {
      processed: false,
      retryCount: 0,
      cancelledAt: null,
      monitorMetadata: reset,
    });
  }

  private mapListItem(log: NonNullable<Awaited<ReturnType<WebhookDeliveryRepository['findById']>>>) {
    const meta = this.repository.getMetadata(log);
    return {
      id: log.id,
      createdAt: log.createdAt.toISOString(),
      orderId: meta.orderId,
      partnerOrderId: meta.partnerOrderId,
      requestId: meta.requestId,
      destination: meta.destinationUrl,
      event: meta.event,
      version: meta.version,
      status: meta.deliveryStatus,
      httpStatus: meta.httpStatus,
      attempts: log.retryCount + 1,
      latencyMs: meta.latencyMs,
      result:
        meta.deliveryStatus === WEBHOOK_DELIVERY_STATUS.DELIVERED
          ? 'Thành công'
          : (meta.lastError ?? '—'),
      lastError: meta.lastError,
      gateway: meta.gateway,
      provider: meta.provider,
    };
  }

  private appendTimeline(
    meta: WebhookDeliveryMonitorMetadata,
    entry: WebhookDeliveryTimelineEntry,
  ): WebhookDeliveryMonitorMetadata {
    return {
      ...meta,
      timeline: [...(meta.timeline ?? []), entry],
    };
  }

  private async markDeadLetter(id: string, meta: WebhookDeliveryMonitorMetadata, reason: string) {
    const updated = this.appendTimeline(meta, {
      at: new Date().toISOString(),
      status: WEBHOOK_DELIVERY_STATUS.DEAD_LETTER,
      detail: reason,
    });
    updated.deliveryStatus = WEBHOOK_DELIVERY_STATUS.DEAD_LETTER;
    updated.lastError = reason;
    await this.repository.updateDelivery(id, { processed: true, monitorMetadata: updated });
  }

  private logActivity(userId: string, deliveryId: string, title: string, eventType: SystemActivityEventType) {
    this.activityDispatcher.dispatch({
      eventType,
      eventCategory: SystemActivityEventCategory.WEBHOOK,
      severity: SystemActivitySeverity.INFO,
      source: SystemActivitySource.PARTNER,
      resource: 'webhook_delivery',
      resourceId: deliveryId,
      title,
      description: title,
      performedBy: userId,
      metadata: { deliveryId },
    });
  }

  private async notifyFailed(agentId: string, deliveryId: string, orderId: string, error: string | null) {
    const agent = await this.agentRepository.findById(agentId);
    if (!agent?.userId) return;
    await this.notificationService.notifyCustomerInApp({
      userId: agent.userId,
      type: 'WEBHOOK_FAILED',
      title: 'Giao webhook thất bại',
      body: `Không gửi được callback cho đơn ${orderId.slice(0, 8)}…: ${error ?? 'Lỗi không xác định'}`,
      metadata: { deliveryId, orderId },
      jobId: `webhook-failed-${deliveryId}`,
    });
  }

  private async notifyDeadLetter(agentId: string, deliveryId: string, orderId: string, error: string | null) {
    const agent = await this.agentRepository.findById(agentId);
    if (!agent?.userId) return;
    await this.notificationService.notifyCustomerInApp({
      userId: agent.userId,
      type: 'WEBHOOK_DEAD_LETTER',
      title: 'Webhook vào Dead Letter',
      body: `Callback đơn ${orderId.slice(0, 8)}… đã hết số lần thử: ${error ?? 'Lỗi không xác định'}`,
      metadata: { deliveryId, orderId },
      jobId: `webhook-dlq-${deliveryId}`,
    });
  }

  private async notifyRetrySuccess(agentId: string, deliveryId: string, orderId: string) {
    const agent = await this.agentRepository.findById(agentId);
    if (!agent?.userId) return;
    await this.notificationService.notifyCustomerInApp({
      userId: agent.userId,
      type: 'WEBHOOK_RETRY_SUCCESS',
      title: 'Giao lại webhook thành công',
      body: `Callback cho đơn ${orderId.slice(0, 8)}… đã giao thành công.`,
      metadata: { deliveryId, orderId },
      jobId: `webhook-retry-ok-${deliveryId}`,
    });
  }

  private async notifyDisabled(agentId: string, deliveryId: string) {
    const agent = await this.agentRepository.findById(agentId);
    if (!agent?.userId) return;
    await this.notificationService.notifyCustomerInApp({
      userId: agent.userId,
      type: 'WEBHOOK_DISABLED',
      title: 'Webhook bị tắt',
      body: 'Không thể giao callback vì webhook chưa bật hoặc thiếu cấu hình.',
      metadata: { deliveryId },
      jobId: `webhook-disabled-${deliveryId}`,
    });
  }
}
