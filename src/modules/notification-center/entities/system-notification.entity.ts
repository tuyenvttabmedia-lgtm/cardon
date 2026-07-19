import {
  SystemActivitySource,
  SystemNotificationChannel,
  SystemNotificationRecipientType,
  SystemNotificationSeverity,
  SystemNotificationType,
  UserRole,
} from '@prisma/client';

export interface NotificationDispatchPayload {
  title: string;
  message: string;
  notificationType: SystemNotificationType;
  severity: SystemNotificationSeverity;
  source: SystemActivitySource;
  resource?: string | null;
  resourceId?: string | null;
  resourceDisplay?: string | null;
  targetRoles: UserRole[];
  metadata?: Record<string, unknown>;
  activityEventType?: string;
}

export interface SystemNotificationRecord {
  id: string;
  title: string;
  message: string;
  notificationType: SystemNotificationType;
  severity: SystemNotificationSeverity;
  source: SystemActivitySource;
  resource: string | null;
  resourceId: string | null;
  resourceDisplay: string | null;
  recipientType: SystemNotificationRecipientType;
  recipientId: string | null;
  recipientRole: UserRole | null;
  isRead: boolean;
  readAt: Date | null;
  channel: SystemNotificationChannel;
  metadata: unknown;
  createdAt: Date;
  resourceHref?: string | null;
}
