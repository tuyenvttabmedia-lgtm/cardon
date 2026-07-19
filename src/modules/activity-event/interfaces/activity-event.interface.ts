import {
  SystemActivityEventCategory,
  SystemActivityEventType,
  SystemActivitySeverity,
  SystemActivitySource,
  UserRole,
} from '@prisma/client';

export interface ActivityRequestContext {
  ipAddress?: string;
  userAgent?: string | null;
  sessionId?: string | null;
  correlationId?: string | null;
}

export interface ActivityEventPayload {
  eventType: SystemActivityEventType;
  eventCategory: SystemActivityEventCategory;
  severity: SystemActivitySeverity;
  source: SystemActivitySource;
  resource?: string | null;
  resourceId?: string | null;
  resourceDisplay?: string | null;
  title: string;
  description?: string | null;
  performedBy?: string | null;
  performedEmail?: string | null;
  performedRole?: UserRole | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  sessionId?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ActivityEventSubscriber {
  handle(event: ActivityEventPayload): void | Promise<void>;
}

export const STAFF_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.SUPPORT,
  UserRole.MARKETING,
  UserRole.ACCOUNTANT,
];

export function isStaffRole(role: UserRole): boolean {
  return STAFF_ROLES.includes(role);
}

export const ACTIVITY_EXCLUDED_PATH_PREFIXES = [
  '/health',
  '/admin/activity',
  '/admin/notifications',
  '/admin/queues',
  '/admin/webhooks',
  '/admin/configuration',
] as const;
