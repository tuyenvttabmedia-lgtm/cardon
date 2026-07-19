import { SystemAuditAction, SystemAuditResource, UserRole } from '@prisma/client';

export interface SystemAuditLogRecord {
  id: string;
  resource: SystemAuditResource;
  resourceId: string | null;
  resourceName: string | null;
  action: SystemAuditAction;
  fieldName: string | null;
  oldValue: unknown;
  newValue: unknown;
  performedBy: string;
  performedEmail: string;
  performedRole: UserRole;
  ipAddress: string | null;
  userAgent: string | null;
  sessionId: string | null;
  correlationId: string | null;
  reason: string | null;
  createdAt: Date;
}

export interface AuditLogStats {
  today: number;
  yesterday: number;
  thisMonth: number;
  total: number;
}

export interface AuditLogListResult {
  items: SystemAuditLogRecord[];
  total: number;
  page: number;
  limit: number;
  stats: AuditLogStats;
}
