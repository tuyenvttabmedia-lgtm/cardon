import {
  SystemActivityEventCategory,
  SystemActivityEventType,
  SystemActivitySeverity,
  SystemNotificationSeverity,
  SystemNotificationType,
  UserRole,
} from '@prisma/client';

export const NOTIFICATION_ACTIVITY_EVENTS = new Set<SystemActivityEventType>([
  SystemActivityEventType.SMTP_FAILED,
  SystemActivityEventType.PROVIDER_SYNC_FAILED,
  SystemActivityEventType.QUEUE_FAILED,
  SystemActivityEventType.WEBHOOK_FAILED,
  SystemActivityEventType.LOGIN_FAILED,
  SystemActivityEventType.MAINTENANCE_ENABLED,
  SystemActivityEventType.LOW_PROVIDER_BALANCE,
  SystemActivityEventType.LOW_AGENT_BALANCE,
  SystemActivityEventType.API_KEY_ROTATED,
  SystemActivityEventType.DOWNLOAD_PIN,
]);

export const EXCLUDED_NOTIFICATION_ACTIVITY_EVENTS = new Set<SystemActivityEventType>([
  SystemActivityEventType.LOGIN,
  SystemActivityEventType.LOGOUT,
  SystemActivityEventType.SMTP_SUCCESS,
  SystemActivityEventType.PROVIDER_SYNC,
]);

export function mapActivitySeverityToNotification(
  severity: SystemActivitySeverity,
): SystemNotificationSeverity {
  return severity as unknown as SystemNotificationSeverity;
}

export function mapActivityCategoryToNotificationType(
  category: SystemActivityEventCategory,
  eventType: SystemActivityEventType,
): SystemNotificationType {
  if (eventType === SystemActivityEventType.LOGIN_FAILED) {
    return SystemNotificationType.SECURITY;
  }
  if (eventType === SystemActivityEventType.DOWNLOAD_PIN) {
    return SystemNotificationType.ORDER;
  }
  if (eventType === SystemActivityEventType.MAINTENANCE_ENABLED) {
    return SystemNotificationType.PROVIDER;
  }
  if (eventType === SystemActivityEventType.LOW_PROVIDER_BALANCE) {
    return SystemNotificationType.PROVIDER;
  }
  if (eventType === SystemActivityEventType.LOW_AGENT_BALANCE) {
    return SystemNotificationType.FINANCE;
  }
  if (eventType === SystemActivityEventType.API_KEY_ROTATED) {
    return SystemNotificationType.SECURITY;
  }

  const map: Partial<Record<SystemActivityEventCategory, SystemNotificationType>> = {
    [SystemActivityEventCategory.AUTH]: SystemNotificationType.SECURITY,
    [SystemActivityEventCategory.EMAIL]: SystemNotificationType.EMAIL,
    [SystemActivityEventCategory.PROVIDER]: SystemNotificationType.PROVIDER,
    [SystemActivityEventCategory.QUEUE]: SystemNotificationType.QUEUE,
    [SystemActivityEventCategory.WEBHOOK]: SystemNotificationType.WEBHOOK,
    [SystemActivityEventCategory.PAYMENT]: SystemNotificationType.PAYMENT,
    [SystemActivityEventCategory.ORDER]: SystemNotificationType.ORDER,
    [SystemActivityEventCategory.FINANCE]: SystemNotificationType.FINANCE,
    [SystemActivityEventCategory.MARKETING]: SystemNotificationType.MARKETING,
    [SystemActivityEventCategory.SYSTEM]: SystemNotificationType.SYSTEM,
  };

  return map[category] ?? SystemNotificationType.SYSTEM;
}

export function targetRolesForNotificationType(type: SystemNotificationType): UserRole[] {
  const base = [UserRole.SUPER_ADMIN, UserRole.ADMIN];

  switch (type) {
    case SystemNotificationType.ORDER:
      return [...base, UserRole.SUPPORT];
    case SystemNotificationType.FINANCE:
      return [...base, UserRole.ACCOUNTANT];
    case SystemNotificationType.MARKETING:
      return [...base, UserRole.MARKETING];
    case SystemNotificationType.SECURITY:
      return base;
    default:
      return base;
  }
}

export function notificationVisibleForRole(
  role: UserRole,
  notificationType: SystemNotificationType,
): boolean {
  if (role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN) {
    return true;
  }
  if (role === UserRole.SUPPORT) {
    const supportTypes: SystemNotificationType[] = [
      SystemNotificationType.ORDER,
      SystemNotificationType.SYSTEM,
      SystemNotificationType.SECURITY,
    ];
    return supportTypes.includes(notificationType);
  }
  if (role === UserRole.MARKETING) {
    return notificationType === SystemNotificationType.MARKETING;
  }
  if (role === UserRole.ACCOUNTANT) {
    return notificationType === SystemNotificationType.FINANCE;
  }
  return false;
}

export function resourceHref(resource: string | null, resourceId: string | null): string | null {
  if (!resource) return null;
  const key = resource.toLowerCase();
  if (key.includes('smtp') || key === 'email') return '/settings/smtp';
  if (key.includes('provider')) {
    return resourceId ? `/providers/${resourceId}` : '/settings/providers';
  }
  if (key.includes('order') && resourceId) return `/orders/${resourceId}`;
  if (key.includes('payment')) return '/settings/payment';
  if (key.includes('queue')) return '/monitoring/activity';
  if (key.includes('webhook')) return '/settings/payment';
  return null;
}
