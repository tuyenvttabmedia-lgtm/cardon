import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { UserRole } from '@prisma/client';
import { AppLoggerService } from '../../../logger/app-logger.service';
import { SystemNotificationQueryDto } from '../dto/system-notification.dto';
import {
  mapActivityCategoryToNotificationType,
  mapActivitySeverityToNotification,
  NOTIFICATION_ACTIVITY_EVENTS,
  EXCLUDED_NOTIFICATION_ACTIVITY_EVENTS,
  notificationVisibleForRole,
  resourceHref,
  targetRolesForNotificationType,
} from '../entities/notification-center.constants';
import { NotificationDispatchPayload, SystemNotificationRecord } from '../entities/system-notification.entity';
import { SystemNotificationRepository } from '../repositories/system-notification.repository';
import { ActivityEventPayload } from '../../activity-event/interfaces/activity-event.interface';
import { SystemNotification } from '@prisma/client';

@Injectable()
export class SystemNotificationService {
  constructor(
    private readonly repository: SystemNotificationRepository,
    private readonly logger: AppLoggerService,
  ) {}

  dispatch(payload: NotificationDispatchPayload): void {
    void this.repository
      .createInAppForRoles(payload)
      .catch((err: unknown) => {
        this.logger.error(
          `Failed to persist notification: ${err instanceof Error ? err.message : String(err)}`,
          err instanceof Error ? err.stack : undefined,
          SystemNotificationService.name,
        );
      });
  }

  fromActivityEvent(event: ActivityEventPayload): NotificationDispatchPayload | null {
    if (EXCLUDED_NOTIFICATION_ACTIVITY_EVENTS.has(event.eventType)) {
      return null;
    }
    if (!NOTIFICATION_ACTIVITY_EVENTS.has(event.eventType)) {
      return null;
    }

    const notificationType = mapActivityCategoryToNotificationType(
      event.eventCategory,
      event.eventType,
    );
    const severity = mapActivitySeverityToNotification(event.severity);
    const targetRoles = targetRolesForNotificationType(notificationType).filter((role) =>
      notificationVisibleForRole(role, notificationType),
    );

    return {
      title: event.title,
      message: event.description ?? event.title,
      notificationType,
      severity,
      source: event.source,
      resource: event.resource ?? null,
      resourceId: event.resourceId ?? null,
      resourceDisplay: event.resourceDisplay ?? null,
      targetRoles,
      metadata: {
        ...(event.metadata ?? {}),
        activityEventType: event.eventType,
        correlationId: event.correlationId,
      },
      activityEventType: event.eventType,
    };
  }

  async list(userId: string, role: UserRole, query: SystemNotificationQueryDto) {
    const [rows, total, stats] = await this.repository.findForUser(userId, role, query);
    const items = rows
      .filter((row) => notificationVisibleForRole(role, row.notificationType))
      .map((row) => this.mapRow(row));

    return {
      items,
      total,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      stats,
    };
  }

  async getOne(id: string, userId: string, role: UserRole) {
    const row = await this.repository.findByIdForUser(id, userId, role);
    if (!row || !notificationVisibleForRole(role, row.notificationType)) {
      return null;
    }
    return this.mapRow(row);
  }

  unreadCount(userId: string, role: UserRole) {
    return this.repository.countUnread(userId, role).then((count) => ({ count }));
  }

  markRead(id: string, userId: string, role: UserRole) {
    return this.repository.markRead(id, userId, role).then((result) => ({ count: result.count }));
  }

  markAllRead(userId: string, role: UserRole) {
    return this.repository.markAllRead(userId, role).then((result) => ({ count: result.count }));
  }

  dismiss(ids: string[], userId: string, role: UserRole) {
    return this.repository.softDelete(ids, userId, role).then((result) => ({ count: result.count }));
  }

  async exportCsv(userId: string, role: UserRole, query: SystemNotificationQueryDto) {
    const rows = await this.repository.findAllForExport(userId, role, query);
    const lines = [
      'Date,Severity,Type,Title,Message,Read,Source',
      ...rows.map((row) =>
        [
          row.createdAt.toISOString(),
          row.severity,
          row.notificationType,
          this.csvEscape(row.title),
          this.csvEscape(row.message),
          row.isRead ? 'yes' : 'no',
          row.source,
        ].join(','),
      ),
    ];
    return {
      buffer: Buffer.from(lines.join('\n'), 'utf8'),
      filename: `notifications-${new Date().toISOString().slice(0, 10)}.csv`,
    };
  }

  async exportExcel(userId: string, role: UserRole, query: SystemNotificationQueryDto) {
    const rows = await this.repository.findAllForExport(userId, role, query);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Notifications');
    sheet.columns = [
      { header: 'Date', key: 'date', width: 24 },
      { header: 'Severity', key: 'severity', width: 12 },
      { header: 'Type', key: 'type', width: 14 },
      { header: 'Title', key: 'title', width: 32 },
      { header: 'Message', key: 'message', width: 48 },
      { header: 'Read', key: 'read', width: 8 },
      { header: 'Source', key: 'source', width: 12 },
    ];
    for (const row of rows) {
      sheet.addRow({
        date: row.createdAt.toISOString(),
        severity: row.severity,
        type: row.notificationType,
        title: row.title,
        message: row.message,
        read: row.isRead ? 'yes' : 'no',
        source: row.source,
      });
    }
    sheet.getRow(1).font = { bold: true };
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return {
      buffer,
      filename: `notifications-${new Date().toISOString().slice(0, 10)}.xlsx`,
    };
  }

  private mapRow(row: SystemNotification): SystemNotificationRecord {
    return {
      id: row.id,
      title: row.title,
      message: row.message,
      notificationType: row.notificationType,
      severity: row.severity,
      source: row.source,
      resource: row.resource,
      resourceId: row.resourceId,
      resourceDisplay: row.resourceDisplay,
      recipientType: row.recipientType,
      recipientId: row.recipientId,
      recipientRole: row.recipientRole,
      isRead: row.isRead,
      readAt: row.readAt,
      channel: row.channel,
      metadata: row.metadata,
      createdAt: row.createdAt,
      resourceHref: resourceHref(row.resource, row.resourceId),
    };
  }

  private csvEscape(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
