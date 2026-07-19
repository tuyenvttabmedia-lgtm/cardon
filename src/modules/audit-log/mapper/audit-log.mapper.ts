import { SystemAuditLog } from '@prisma/client';
import { SystemAuditLogRecord } from '../entities/system-audit-log.entity';

export function mapSystemAuditLog(row: SystemAuditLog): SystemAuditLogRecord {
  return {
    id: row.id,
    resource: row.resource,
    resourceId: row.resourceId,
    resourceName: row.resourceName,
    action: row.action,
    fieldName: row.fieldName,
    oldValue: row.oldValue,
    newValue: row.newValue,
    performedBy: row.performedBy,
    performedEmail: row.performedEmail,
    performedRole: row.performedRole,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    sessionId: row.sessionId,
    correlationId: row.correlationId,
    reason: row.reason,
    createdAt: row.createdAt,
  };
}

export function mapSystemAuditLogList(rows: SystemAuditLog[]): SystemAuditLogRecord[] {
  return rows.map(mapSystemAuditLog);
}
