import { Injectable } from '@nestjs/common';
import {
  Prisma,
  SystemActivityEventCategory,
  SystemActivityEventType,
  SystemActivitySeverity,
  SystemActivitySource,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { ActivityEventPayload } from '../../activity-event/interfaces/activity-event.interface';
import { ActivityLogQueryDto } from '../dto/activity-log.dto';

@Injectable()
export class ActivityLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: ActivityEventPayload) {
    return this.prisma.systemActivityLog.create({
      data: {
        eventType: data.eventType,
        eventCategory: data.eventCategory,
        severity: data.severity,
        source: data.source,
        resource: data.resource ?? null,
        resourceId: data.resourceId ?? null,
        resourceDisplay: data.resourceDisplay ?? null,
        title: data.title,
        description: data.description ?? null,
        performedBy: data.performedBy ?? null,
        performedEmail: data.performedEmail ?? null,
        performedRole: data.performedRole ?? null,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
        sessionId: data.sessionId ?? null,
        correlationId: data.correlationId ?? null,
        metadata: (data.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  findById(id: string) {
    return this.prisma.systemActivityLog.findUnique({ where: { id } });
  }

  async findAll(query: ActivityLogQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where = this.buildWhere(query);

    const [items, total, stats] = await Promise.all([
      this.prisma.systemActivityLog.findMany({
        where,
        orderBy: { createdAt: query.sort === 'oldest' ? 'asc' : 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.systemActivityLog.count({ where }),
      this.getStats(),
    ]);

    return { items, total, page, limit, stats };
  }

  findAllForExport(query: ActivityLogQueryDto) {
    return this.prisma.systemActivityLog.findMany({
      where: this.buildWhere(query),
      orderBy: { createdAt: query.sort === 'oldest' ? 'asc' : 'desc' },
      take: 10_000,
    });
  }

  private buildWhere(query: ActivityLogQueryDto): Prisma.SystemActivityLogWhereInput {
    const where: Prisma.SystemActivityLogWhereInput = {};

    if (query.severity) {
      where.severity = query.severity as SystemActivitySeverity;
    }
    if (query.category) {
      where.eventCategory = query.category as SystemActivityEventCategory;
    }
    if (query.source) {
      where.source = query.source as SystemActivitySource;
    }
    if (query.event) {
      where.eventType = query.event as SystemActivityEventType;
    }
    if (query.user) {
      where.performedBy = query.user;
    }
    if (query.role) {
      where.performedRole = query.role as UserRole;
    }

    if (query.date_from || query.date_to) {
      where.createdAt = {};
      if (query.date_from) {
        where.createdAt.gte = new Date(query.date_from);
      }
      if (query.date_to) {
        const end = new Date(query.date_to);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    if (query.keyword?.trim()) {
      const keyword = query.keyword.trim();
      where.OR = [
        { title: { contains: keyword, mode: 'insensitive' } },
        { description: { contains: keyword, mode: 'insensitive' } },
        { performedEmail: { contains: keyword, mode: 'insensitive' } },
        { resourceDisplay: { contains: keyword, mode: 'insensitive' } },
        { ipAddress: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private async getStats() {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    const dayOfWeek = now.getDay();
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - diffToMonday);

    const [today, yesterday, thisWeek, total] = await Promise.all([
      this.prisma.systemActivityLog.count({ where: { createdAt: { gte: startOfToday } } }),
      this.prisma.systemActivityLog.count({
        where: { createdAt: { gte: startOfYesterday, lt: startOfToday } },
      }),
      this.prisma.systemActivityLog.count({ where: { createdAt: { gte: startOfWeek } } }),
      this.prisma.systemActivityLog.count(),
    ]);

    return { today, yesterday, thisWeek, total };
  }
}
