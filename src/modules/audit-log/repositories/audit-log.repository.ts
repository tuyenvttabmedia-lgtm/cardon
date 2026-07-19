import { Injectable } from '@nestjs/common';
import {
  Prisma,
  SystemAuditAction,
  SystemAuditResource,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { AuditLogQueryDto, CreateSystemAuditLogDto } from '../dto/audit-log.dto';
import { AuditLogStats } from '../entities/system-audit-log.entity';

@Injectable()
export class AuditLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateSystemAuditLogDto) {
    return this.prisma.systemAuditLog.create({
      data: {
        resource: data.resource,
        resourceId: data.resourceId ?? null,
        resourceName: data.resourceName ?? null,
        action: data.action,
        fieldName: data.fieldName ?? null,
        oldValue: data.oldValue as Prisma.InputJsonValue,
        newValue: data.newValue as Prisma.InputJsonValue,
        performedBy: data.performedBy,
        performedEmail: data.performedEmail,
        performedRole: data.performedRole,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
        sessionId: data.sessionId ?? null,
        correlationId: data.correlationId ?? null,
        reason: data.reason ?? null,
      },
    });
  }

  findById(id: string) {
    return this.prisma.systemAuditLog.findUnique({ where: { id } });
  }

  async findAll(query: AuditLogQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where = this.buildWhere(query);

    const [items, total, stats] = await Promise.all([
      this.prisma.systemAuditLog.findMany({
        where,
        orderBy: { createdAt: query.sort === 'oldest' ? 'asc' : 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.systemAuditLog.count({ where }),
      this.getStats(),
    ]);

    return { items, total, page, limit, stats };
  }

  findAllForExport(query: AuditLogQueryDto) {
    const where = this.buildWhere(query);
    return this.prisma.systemAuditLog.findMany({
      where,
      orderBy: { createdAt: query.sort === 'oldest' ? 'asc' : 'desc' },
      take: 10_000,
    });
  }

  private buildWhere(query: AuditLogQueryDto): Prisma.SystemAuditLogWhereInput {
    const where: Prisma.SystemAuditLogWhereInput = {};

    if (query.resource) {
      where.resource = query.resource as SystemAuditResource;
    }

    if (query.action) {
      where.action = query.action as SystemAuditAction;
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
        { performedEmail: { contains: keyword, mode: 'insensitive' } },
        { resourceName: { contains: keyword, mode: 'insensitive' } },
        { fieldName: { contains: keyword, mode: 'insensitive' } },
        { reason: { contains: keyword, mode: 'insensitive' } },
        { ipAddress: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private async getStats(): Promise<AuditLogStats> {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [today, yesterday, thisMonth, total] = await Promise.all([
      this.prisma.systemAuditLog.count({
        where: { createdAt: { gte: startOfToday } },
      }),
      this.prisma.systemAuditLog.count({
        where: {
          createdAt: { gte: startOfYesterday, lt: startOfToday },
        },
      }),
      this.prisma.systemAuditLog.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
      this.prisma.systemAuditLog.count(),
    ]);

    return { today, yesterday, thisMonth, total };
  }
}
