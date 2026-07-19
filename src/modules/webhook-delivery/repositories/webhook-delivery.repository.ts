import { Injectable } from '@nestjs/common';
import { Prisma, WebhookLog, WebhookSource } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { WebhookDeliveryStatus } from '../entities/webhook-delivery.constants';
import { WebhookDeliveryMonitorMetadata } from '../entities/webhook-delivery.types';

@Injectable()
export class WebhookDeliveryRepository {
  constructor(private readonly prisma: PrismaService) {}

  deliveryReference(orderId: string, event: string): string {
    return `PD:${orderId}:${event}`;
  }

  findByReference(reference: string) {
    return this.prisma.webhookLog.findFirst({
      where: { paymentReference: reference, source: WebhookSource.PARTNER },
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(id: string) {
    return this.prisma.webhookLog.findUnique({ where: { id } });
  }

  findByIdForAgent(id: string, agentId: string) {
    return this.prisma.webhookLog.findFirst({
      where: {
        id,
        source: WebhookSource.PARTNER,
        monitorMetadata: {
          path: ['agentId'],
          equals: agentId,
        },
      },
    });
  }

  createDelivery(input: {
    paymentReference: string;
    payload: Prisma.InputJsonValue;
    monitorMetadata: WebhookDeliveryMonitorMetadata;
  }) {
    return this.prisma.webhookLog.create({
      data: {
        source: WebhookSource.PARTNER,
        paymentReference: input.paymentReference,
        payload: input.payload,
        signatureValid: true,
        processed: false,
        retryCount: 0,
        monitorMetadata: input.monitorMetadata as unknown as Prisma.InputJsonValue,
      },
    });
  }

  updateDelivery(
    id: string,
    data: {
      processed?: boolean;
      retryCount?: number;
      cancelledAt?: Date | null;
      monitorMetadata?: WebhookDeliveryMonitorMetadata;
      payload?: Prisma.InputJsonValue;
    },
  ) {
    return this.prisma.webhookLog.update({
      where: { id },
      data: {
        processed: data.processed,
        retryCount: data.retryCount,
        cancelledAt: data.cancelledAt,
        monitorMetadata: data.monitorMetadata as unknown as Prisma.InputJsonValue | undefined,
        payload: data.payload,
      },
    });
  }

  listForAgent(
    agentId: string,
    query: {
      skip: number;
      take: number;
      status?: WebhookDeliveryStatus;
      event?: string;
      search?: string;
      httpStatus?: number;
      dateFrom?: Date;
      dateTo?: Date;
      gateway?: string;
      provider?: string;
    },
  ) {
    const where = this.buildAgentWhere(agentId, query);
    return this.prisma.webhookLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: query.skip,
      take: query.take,
    });
  }

  countForAgent(
    agentId: string,
    query: Parameters<WebhookDeliveryRepository['listForAgent']>[1],
  ) {
    return this.prisma.webhookLog.count({
      where: this.buildAgentWhere(agentId, query),
    });
  }

  private buildAgentWhere(
    agentId: string,
    query: {
      status?: WebhookDeliveryStatus;
      event?: string;
      search?: string;
      httpStatus?: number;
      dateFrom?: Date;
      dateTo?: Date;
      gateway?: string;
      provider?: string;
    },
  ): Prisma.WebhookLogWhereInput {
    const where: Prisma.WebhookLogWhereInput = {
      source: WebhookSource.PARTNER,
      monitorMetadata: {
        path: ['direction'],
        equals: 'outbound',
      },
      AND: [
        {
          monitorMetadata: {
            path: ['agentId'],
            equals: agentId,
          },
        },
      ],
    };

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = query.dateFrom;
      if (query.dateTo) where.createdAt.lte = query.dateTo;
    }

    if (query.status) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          monitorMetadata: {
            path: ['deliveryStatus'],
            equals: query.status,
          },
        },
      ];
    }

    if (query.event) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          monitorMetadata: {
            path: ['event'],
            equals: query.event,
          },
        },
      ];
    }

    if (query.httpStatus != null) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          monitorMetadata: {
            path: ['httpStatus'],
            equals: query.httpStatus,
          },
        },
      ];
    }

    if (query.gateway) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          monitorMetadata: {
            path: ['gateway'],
            equals: query.gateway,
          },
        },
      ];
    }

    if (query.provider) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          monitorMetadata: {
            path: ['provider'],
            equals: query.provider,
          },
        },
      ];
    }

    if (query.search?.trim()) {
      const q = query.search.trim();
      where.OR = [
        { paymentReference: { contains: q, mode: 'insensitive' } },
        { monitorMetadata: { path: ['orderId'], string_contains: q } },
        { monitorMetadata: { path: ['requestId'], string_contains: q } },
        { monitorMetadata: { path: ['partnerOrderId'], string_contains: q } },
        { monitorMetadata: { path: ['destinationUrl'], string_contains: q } },
      ];
    }

    return where;
  }

  statsForAgent(agentId: string, since: Date) {
    return this.prisma.webhookLog.findMany({
      where: {
        source: WebhookSource.PARTNER,
        createdAt: { gte: since },
        monitorMetadata: {
          path: ['agentId'],
          equals: agentId,
        },
      },
      select: {
        processed: true,
        retryCount: true,
        cancelledAt: true,
        monitorMetadata: true,
      },
    });
  }

  getMetadata(log: WebhookLog): WebhookDeliveryMonitorMetadata {
    return (log.monitorMetadata ?? {}) as unknown as WebhookDeliveryMonitorMetadata;
  }
}
