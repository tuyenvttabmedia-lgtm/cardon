import { Injectable } from '@nestjs/common';
import {
  Prisma,
  SystemNotificationChannel,
  SystemNotificationRecipientType,
  SystemNotificationSeverity,
  SystemNotificationType,
  SystemActivitySource,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { NotificationDispatchPayload } from '../entities/system-notification.entity';
import { SystemNotificationQueryDto } from '../dto/system-notification.dto';
import { notificationVisibleForRole } from '../entities/notification-center.constants';

@Injectable()
export class SystemNotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  createInAppForRoles(payload: NotificationDispatchPayload) {
    return this.prisma.systemNotification.createMany({
      data: payload.targetRoles.map((role) => ({
        title: payload.title,
        message: payload.message,
        notificationType: payload.notificationType,
        severity: payload.severity,
        source: payload.source,
        resource: payload.resource ?? null,
        resourceId: payload.resourceId ?? null,
        resourceDisplay: payload.resourceDisplay ?? null,
        recipientType: SystemNotificationRecipientType.ROLE,
        recipientRole: role,
        channel: SystemNotificationChannel.IN_APP,
        metadata: (payload.metadata ?? {}) as Prisma.InputJsonValue,
      })),
    });
  }

  findForUser(userId: string, role: UserRole, query: SystemNotificationQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where = this.buildWhere(userId, role, query);

    return Promise.all([
      this.prisma.systemNotification.findMany({
        where,
        orderBy: { createdAt: query.sort === 'oldest' ? 'asc' : 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.systemNotification.count({ where }),
      this.getStats(userId, role),
    ]);
  }

  findByIdForUser(id: string, userId: string, role: UserRole) {
    return this.prisma.systemNotification.findFirst({
      where: {
        id,
        deletedAt: null,
        ...this.recipientFilter(userId, role),
      },
    });
  }

  countUnread(userId: string, role: UserRole) {
    return this.prisma.systemNotification.count({
      where: {
        deletedAt: null,
        isRead: false,
        ...this.recipientFilter(userId, role),
      },
    });
  }

  markRead(id: string, userId: string, role: UserRole) {
    return this.prisma.systemNotification.updateMany({
      where: {
        id,
        deletedAt: null,
        isRead: false,
        ...this.recipientFilter(userId, role),
      },
      data: { isRead: true, readAt: new Date() },
    });
  }

  markAllRead(userId: string, role: UserRole) {
    return this.prisma.systemNotification.updateMany({
      where: {
        deletedAt: null,
        isRead: false,
        ...this.recipientFilter(userId, role),
      },
      data: { isRead: true, readAt: new Date() },
    });
  }

  softDelete(ids: string[], userId: string, role: UserRole) {
    return this.prisma.systemNotification.updateMany({
      where: {
        id: { in: ids },
        deletedAt: null,
        ...this.recipientFilter(userId, role),
      },
      data: { deletedAt: new Date() },
    });
  }

  findAllForExport(userId: string, role: UserRole, query: SystemNotificationQueryDto) {
    return this.prisma.systemNotification.findMany({
      where: this.buildWhere(userId, role, query),
      orderBy: { createdAt: query.sort === 'oldest' ? 'asc' : 'desc' },
      take: 10_000,
    });
  }

  private recipientFilter(userId: string, role: UserRole) {
    return {
      OR: [
        { recipientType: SystemNotificationRecipientType.USER, recipientId: userId },
        { recipientType: SystemNotificationRecipientType.ROLE, recipientRole: role },
      ],
    };
  }

  private buildWhere(
    userId: string,
    role: UserRole,
    query: SystemNotificationQueryDto,
  ): Prisma.SystemNotificationWhereInput {
    const base: Prisma.SystemNotificationWhereInput = {
      deletedAt: null,
      channel: SystemNotificationChannel.IN_APP,
      ...this.recipientFilter(userId, role),
    };

    if (query.severity) {
      base.severity = query.severity as SystemNotificationSeverity;
    }
    if (query.type) {
      base.notificationType = query.type as SystemNotificationType;
    }
    if (query.source) {
      base.source = query.source as SystemActivitySource;
    }
    if (query.is_read !== undefined) {
      base.isRead = query.is_read;
    }
    if (query.tab === 'unread') {
      base.isRead = false;
    }
    if (query.tab === 'warnings') {
      base.severity = SystemNotificationSeverity.WARNING;
    }
    if (query.tab === 'critical') {
      base.severity = { in: [SystemNotificationSeverity.ERROR, SystemNotificationSeverity.CRITICAL] };
    }

    if (query.date_from || query.date_to) {
      base.createdAt = {};
      if (query.date_from) base.createdAt.gte = new Date(query.date_from);
      if (query.date_to) {
        const end = new Date(query.date_to);
        end.setHours(23, 59, 59, 999);
        base.createdAt.lte = end;
      }
    }

    if (query.keyword?.trim()) {
      const keyword = query.keyword.trim();
      return {
        AND: [
          base,
          {
            OR: [
              { title: { contains: keyword, mode: 'insensitive' } },
              { message: { contains: keyword, mode: 'insensitive' } },
            ],
          },
        ],
      };
    }

    return base;
  }

  private async getStats(userId: string, role: UserRole) {
    const base = {
      deletedAt: null,
      channel: SystemNotificationChannel.IN_APP,
      ...this.recipientFilter(userId, role),
    };
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const visibleTypes = Object.values(SystemNotificationType).filter((t) =>
      notificationVisibleForRole(role, t),
    );

    const typeFilter =
      role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN
        ? {}
        : { notificationType: { in: visibleTypes } };

    const [unread, today, critical, resolved] = await Promise.all([
      this.prisma.systemNotification.count({ where: { ...base, ...typeFilter, isRead: false } }),
      this.prisma.systemNotification.count({
        where: { ...base, ...typeFilter, createdAt: { gte: startOfToday } },
      }),
      this.prisma.systemNotification.count({
        where: {
          ...base,
          ...typeFilter,
          severity: { in: [SystemNotificationSeverity.ERROR, SystemNotificationSeverity.CRITICAL] },
          isRead: false,
        },
      }),
      this.prisma.systemNotification.count({ where: { ...base, ...typeFilter, isRead: true } }),
    ]);

    return { unread, today, critical, resolved };
  }
}
