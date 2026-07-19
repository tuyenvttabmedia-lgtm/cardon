import { Injectable } from '@nestjs/common';
import { Prisma, WebhookSource } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { WebhookListQueryDto } from '../dto/webhook-monitor.dto';

@Injectable()
export class WebhookMonitorRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(query: WebhookListQueryDto, skip: number, take: number) {
    const where = this.buildWhere(query);
    return this.prisma.webhookLog.findMany({
      where,
      orderBy: { createdAt: query.sort === 'oldest' ? 'asc' : 'desc' },
      skip,
      take,
    });
  }

  count(query: WebhookListQueryDto) {
    return this.prisma.webhookLog.count({ where: this.buildWhere(query) });
  }

  findById(id: string) {
    return this.prisma.webhookLog.findUnique({ where: { id } });
  }

  findByPaymentReferences(refs: string[]) {
    if (refs.length === 0) return Promise.resolve([] as Array<{ id: string; paymentReference: string; createdAt: Date }>);
    return this.prisma.webhookLog.findMany({
      where: { paymentReference: { in: refs } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, paymentReference: true, createdAt: true },
    });
  }

  findPaymentsByReferences(refs: string[]) {
    if (refs.length === 0) return Promise.resolve([]);
    return this.prisma.payment.findMany({
      where: { paymentReference: { in: refs } },
      select: {
        id: true,
        orderId: true,
        status: true,
        gateway: true,
        paymentReference: true,
      },
    });
  }

  findSince(since: Date, source?: WebhookSource) {
    return this.prisma.webhookLog.findMany({
      where: {
        createdAt: { gte: since },
        ...(source ? { source } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });
  }

  findRetryable(limit = 100) {
    return this.prisma.webhookLog.findMany({
      where: {
        cancelledAt: null,
        signatureValid: true,
        processed: false,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  incrementRetry(id: string) {
    return this.prisma.webhookLog.update({
      where: { id },
      data: {
        retryCount: { increment: 1 },
      },
    });
  }

  cancelMany(ids: string[]) {
    return this.prisma.webhookLog.updateMany({
      where: { id: { in: ids }, cancelledAt: null },
      data: {
        cancelledAt: new Date(),
        processed: true,
      },
    });
  }

  private buildWhere(query: WebhookListQueryDto): Prisma.WebhookLogWhereInput {
    const where: Prisma.WebhookLogWhereInput = {};
    if (query.source) where.source = query.source;
    if (query.date_from || query.date_to) {
      where.createdAt = {};
      if (query.date_from) where.createdAt.gte = new Date(query.date_from);
      if (query.date_to) {
        const end = new Date(query.date_to);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }
    if (query.payment_reference?.trim()) {
      where.paymentReference = { contains: query.payment_reference.trim() };
    }
    return where;
  }
}
