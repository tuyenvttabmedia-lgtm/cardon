import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  SystemActivityEventCategory,
  SystemActivityEventType,
  SystemActivitySeverity,
  SystemActivitySource,
} from '@prisma/client';
import { ActivityEventDispatcher } from '../../activity-event/activity-event-dispatcher.service';
import { NotificationService } from '../../notification/services/notification.service';
import {
  API_LOG_GATEWAY,
  API_LOG_RETENTION_DAYS_DEFAULT,
  ApiLogType,
} from '../entities/api-observability.constants';
import {
  AgentApiRequestLogRepository,
  CreateAgentApiLogInput,
} from '../repositories/agent-api-request-log.repository';
import { maskApiKey, maskApiPayload, maskHeaders } from '../utils/api-log-mask.util';

@Injectable()
export class AgentApiRequestLogService {
  private readonly logger = new Logger(AgentApiRequestLogService.name);

  constructor(
    private readonly repository: AgentApiRequestLogRepository,
    private readonly activityDispatcher: ActivityEventDispatcher,
    private readonly notificationService: NotificationService,
  ) {}

  record(input: CreateAgentApiLogInput): void {
    void this.repository.create(input).catch((err) => {
      this.logger.warn(
        `Failed to persist API log agent=${input.agentId}: ${err instanceof Error ? err.message : err}`,
      );
    });
  }

  recordAuthEvent(params: {
    agentId: string | null;
    logType: ApiLogType | string;
    httpStatus: number;
    endpoint: string;
    method: string;
    sourceIp: string | null;
    requestId?: string | null;
    apiKey?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    userAgent?: string | null;
    correlationId?: string | null;
  }) {
    if (!params.agentId) return;
    this.record({
      agentId: params.agentId,
      logType: params.logType,
      httpStatus: params.httpStatus,
      endpoint: params.endpoint,
      method: params.method,
      sourceIp: params.sourceIp,
      requestId: params.requestId,
      apiKeyMasked: maskApiKey(params.apiKey),
      errorCode: params.errorCode,
      errorMessage: params.errorMessage,
      responseMessage: params.errorMessage,
      userAgent: params.userAgent,
      correlationId: params.correlationId,
      gateway: API_LOG_GATEWAY,
    });

    if (params.logType === 'AUTH_429') {
      void this.notifyRateLimit(params.agentId);
    }
    if (params.logType === 'BLOCKED_IP' || params.logType === 'INVALID_KEY') {
      void this.notifyAuthFailure(params.agentId, params.logType);
    }
  }

  recordRequest(params: {
    agentId: string;
    requestId: string;
    apiKey?: string | null;
    sourceIp: string | null;
    endpoint: string;
    method: string;
    httpStatus: number;
    latencyMs: number;
    userAgent?: string | null;
    correlationId?: string | null;
    requestHeaders?: Record<string, string>;
    requestBody?: unknown;
    responseBody?: unknown;
    responseHeaders?: Record<string, string>;
    orderId?: string | null;
    partnerOrderId?: string | null;
    provider?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  }) {
    const maskedResponse = maskApiPayload(params.responseBody);
    const responseCode =
      params.responseBody && typeof params.responseBody === 'object'
        ? String((params.responseBody as Record<string, unknown>).code ?? (params.responseBody as Record<string, unknown>).status ?? '')
        : null;

    this.record({
      agentId: params.agentId,
      logType: params.httpStatus >= 400 ? 'ERROR' : 'REQUEST',
      httpStatus: params.httpStatus,
      endpoint: params.endpoint,
      method: params.method,
      sourceIp: params.sourceIp,
      requestId: params.requestId,
      apiKeyMasked: maskApiKey(params.apiKey),
      latencyMs: params.latencyMs,
      gateway: API_LOG_GATEWAY,
      provider: params.provider ?? 'esale',
      orderId: params.orderId,
      partnerOrderId: params.partnerOrderId ?? params.requestId,
      responseCode: responseCode || null,
      responseMessage:
        params.errorMessage ??
        (params.responseBody && typeof params.responseBody === 'object'
          ? String((params.responseBody as Record<string, unknown>).message ?? '')
          : null),
      errorCode: params.errorCode,
      errorMessage: params.errorMessage,
      userAgent: params.userAgent,
      correlationId: params.correlationId,
      requestHeaders: maskHeaders(params.requestHeaders ?? {}),
      requestBody: maskApiPayload(params.requestBody),
      responseBody: maskedResponse,
      responseHeaders: maskHeaders(params.responseHeaders ?? {}),
    });
  }

  async listForAgent(
    agentId: string,
    query: {
      page?: number;
      limit?: number;
      logType?: string;
      search?: string;
      httpStatus?: number;
      endpoint?: string;
      gateway?: string;
      provider?: string;
      minLatency?: number;
      maxLatency?: number;
      sourceIp?: string;
      dateFrom?: string;
      dateTo?: string;
    },
  ) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const listQuery = {
      agentId,
      skip,
      take: limit,
      logType: query.logType,
      search: query.search,
      httpStatus: query.httpStatus,
      endpoint: query.endpoint,
      gateway: query.gateway,
      provider: query.provider,
      minLatency: query.minLatency,
      maxLatency: query.maxLatency,
      sourceIp: query.sourceIp,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
    };

    const [rows, total] = await Promise.all([
      this.repository.list(listQuery),
      this.repository.count(listQuery),
    ]);

    return {
      items: rows.map((row) => this.mapListItem(row)),
      page,
      limit,
      total,
    };
  }

  async getDetail(agentId: string, id: string) {
    const row = await this.repository.findByIdForAgent(id, agentId);
    if (!row) throw new NotFoundException('API log not found');
    return {
      ...this.mapListItem(row),
      requestHeaders: row.requestHeaders,
      requestBody: row.requestBody,
      responseBody: row.responseBody,
      responseHeaders: row.responseHeaders,
      timeline: [
        { at: row.requestTime.toISOString(), step: 'request', detail: `${row.method} ${row.endpoint}` },
        {
          at: row.requestTime.toISOString(),
          step: row.httpStatus >= 400 ? 'error' : 'response',
          detail: row.responseMessage ?? `HTTP ${row.httpStatus}`,
          httpStatus: row.httpStatus,
        },
      ],
    };
  }

  async adminList(query: Parameters<AgentApiRequestLogService['listForAgent']>[1] & { agentId?: string }) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const listQuery = {
      agentId: query.agentId,
      skip,
      take: limit,
      logType: query.logType,
      search: query.search,
      httpStatus: query.httpStatus,
      endpoint: query.endpoint,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
    };
    const [rows, total] = await Promise.all([
      this.repository.list(listQuery),
      this.repository.count(listQuery),
    ]);
    return { items: rows.map((row) => this.mapListItem(row)), page, limit, total };
  }

  async adminGet(id: string) {
    const row = await this.repository.findById(id);
    if (!row) throw new NotFoundException('API log not found');
    return {
      ...this.mapListItem(row),
      requestHeaders: row.requestHeaders,
      requestBody: row.requestBody,
      responseBody: row.responseBody,
      responseHeaders: row.responseHeaders,
    };
  }

  purgeExpired(retentionDays = API_LOG_RETENTION_DAYS_DEFAULT) {
    const before = new Date(Date.now() - retentionDays * 86_400_000);
    return this.repository.deleteOlderThan(before);
  }

  logPartnerActivity(userId: string, action: string, metadata?: Record<string, unknown>) {
    this.activityDispatcher.dispatch({
      eventType:
        action === 'export'
          ? SystemActivityEventType.EXPORT_CSV
          : action === 'test'
            ? SystemActivityEventType.API_KEY_CREATED
            : SystemActivityEventType.WEBHOOK_RECEIVED,
      eventCategory: SystemActivityEventCategory.API,
      severity: SystemActivitySeverity.INFO,
      source: SystemActivitySource.PARTNER,
      resource: 'api_log',
      title: action,
      description: action,
      performedBy: userId,
      metadata,
    });
  }

  private mapListItem(row: NonNullable<Awaited<ReturnType<AgentApiRequestLogRepository['findById']>>>) {
    return {
      id: row.id,
      at: row.requestTime.toISOString(),
      type: row.logType,
      ip: row.sourceIp,
      path: row.endpoint,
      method: row.method,
      message: row.responseMessage ?? row.errorMessage ?? row.logType,
      requestId: row.requestId,
      apiKeyMasked: row.apiKeyMasked,
      httpStatus: row.httpStatus,
      latencyMs: row.latencyMs,
      gateway: row.gateway,
      provider: row.provider,
      orderId: row.orderId,
      partnerOrderId: row.partnerOrderId,
      errorCode: row.errorCode,
      correlationId: row.correlationId,
    };
  }

  private async notifyRateLimit(agentId: string) {
    // resolved via agent user lookup in notification layer if needed
    this.logger.warn(`Rate limit spike agent=${agentId}`);
  }

  private async notifyAuthFailure(agentId: string, type: string) {
    this.logger.warn(`Auth failure agent=${agentId} type=${type}`);
  }
}
