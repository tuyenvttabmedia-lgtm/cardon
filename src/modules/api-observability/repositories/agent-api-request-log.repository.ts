import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { ApiLogType } from '../entities/api-observability.constants';

export interface CreateAgentApiLogInput {
  agentId: string;
  requestId?: string | null;
  apiKeyMasked?: string | null;
  sourceIp?: string | null;
  endpoint: string;
  method: string;
  httpStatus: number;
  latencyMs?: number | null;
  gateway?: string | null;
  provider?: string | null;
  orderId?: string | null;
  partnerOrderId?: string | null;
  responseCode?: string | null;
  responseMessage?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  logType: ApiLogType | string;
  retry?: boolean;
  userAgent?: string | null;
  correlationId?: string | null;
  requestHeaders?: Record<string, unknown>;
  requestBody?: unknown;
  responseBody?: unknown;
  responseHeaders?: Record<string, unknown>;
}

export interface ApiLogListQuery {
  skip: number;
  take: number;
  logType?: string;
  search?: string;
  httpStatus?: number;
  endpoint?: string;
  gateway?: string;
  provider?: string;
  minLatency?: number;
  maxLatency?: number;
  apiKeyMasked?: string;
  sourceIp?: string;
  dateFrom?: Date;
  dateTo?: Date;
  agentId?: string;
}

@Injectable()
export class AgentApiRequestLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateAgentApiLogInput) {
    return this.prisma.agentApiRequestLog.create({
      data: {
        agentId: input.agentId,
        requestId: input.requestId,
        apiKeyMasked: input.apiKeyMasked,
        sourceIp: input.sourceIp,
        endpoint: input.endpoint,
        method: input.method,
        httpStatus: input.httpStatus,
        latencyMs: input.latencyMs,
        gateway: input.gateway ?? 'partner_api',
        provider: input.provider,
        orderId: input.orderId,
        partnerOrderId: input.partnerOrderId,
        responseCode: input.responseCode,
        responseMessage: input.responseMessage,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        logType: input.logType,
        retry: input.retry ?? false,
        userAgent: input.userAgent,
        correlationId: input.correlationId,
        requestHeaders: (input.requestHeaders ?? {}) as Prisma.InputJsonValue,
        requestBody: input.requestBody as Prisma.InputJsonValue | undefined,
        responseBody: input.responseBody as Prisma.InputJsonValue | undefined,
        responseHeaders: (input.responseHeaders ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  findById(id: string) {
    return this.prisma.agentApiRequestLog.findUnique({ where: { id } });
  }

  findByIdForAgent(id: string, agentId: string) {
    return this.prisma.agentApiRequestLog.findFirst({ where: { id, agentId } });
  }

  list(query: ApiLogListQuery) {
    return this.prisma.agentApiRequestLog.findMany({
      where: this.buildWhere(query),
      orderBy: { requestTime: 'desc' },
      skip: query.skip,
      take: query.take,
    });
  }

  count(query: ApiLogListQuery) {
    return this.prisma.agentApiRequestLog.count({ where: this.buildWhere(query) });
  }

  statsSince(agentId: string, since: Date) {
    return this.prisma.agentApiRequestLog.findMany({
      where: { agentId, requestTime: { gte: since } },
      select: {
        endpoint: true,
        httpStatus: true,
        latencyMs: true,
        errorCode: true,
        logType: true,
        partnerOrderId: true,
        requestBody: true,
        responseBody: true,
        gateway: true,
        provider: true,
      },
    });
  }

  deleteOlderThan(before: Date) {
    return this.prisma.agentApiRequestLog.deleteMany({
      where: { requestTime: { lt: before } },
    });
  }

  exportRows(query: ApiLogListQuery, take: number) {
    return this.list({ ...query, skip: 0, take });
  }

  private buildWhere(query: ApiLogListQuery): Prisma.AgentApiRequestLogWhereInput {
    const where: Prisma.AgentApiRequestLogWhereInput = {};

    if (query.agentId) where.agentId = query.agentId;
    if (query.logType) where.logType = query.logType;
    if (query.httpStatus != null) where.httpStatus = query.httpStatus;
    if (query.endpoint) where.endpoint = { contains: query.endpoint, mode: 'insensitive' };
    if (query.gateway) where.gateway = query.gateway;
    if (query.provider) where.provider = query.provider;
    if (query.sourceIp) where.sourceIp = { contains: query.sourceIp, mode: 'insensitive' };
    if (query.apiKeyMasked) where.apiKeyMasked = { contains: query.apiKeyMasked, mode: 'insensitive' };

    if (query.minLatency != null || query.maxLatency != null) {
      where.latencyMs = {};
      if (query.minLatency != null) where.latencyMs.gte = query.minLatency;
      if (query.maxLatency != null) where.latencyMs.lte = query.maxLatency;
    }

    if (query.dateFrom || query.dateTo) {
      where.requestTime = {};
      if (query.dateFrom) where.requestTime.gte = query.dateFrom;
      if (query.dateTo) where.requestTime.lte = query.dateTo;
    }

    if (query.search?.trim()) {
      const q = query.search.trim();
      where.OR = [
        { requestId: { contains: q, mode: 'insensitive' } },
        { partnerOrderId: { contains: q, mode: 'insensitive' } },
        { endpoint: { contains: q, mode: 'insensitive' } },
        { sourceIp: { contains: q, mode: 'insensitive' } },
        { apiKeyMasked: { contains: q, mode: 'insensitive' } },
        { errorCode: { contains: q, mode: 'insensitive' } },
        { responseMessage: { contains: q, mode: 'insensitive' } },
        { correlationId: { contains: q, mode: 'insensitive' } },
      ];
    }

    return where;
  }
}
