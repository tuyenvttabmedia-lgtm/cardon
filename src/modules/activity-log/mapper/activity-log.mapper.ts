import { SystemActivityLog } from '@prisma/client';
import { SystemActivityLogRecord } from '../entities/system-activity-log.entity';

export function mapSystemActivityLog(row: SystemActivityLog): SystemActivityLogRecord {
  return {
    id: row.id,
    eventType: row.eventType,
    eventCategory: row.eventCategory,
    severity: row.severity,
    source: row.source,
    resource: row.resource,
    resourceId: row.resourceId,
    resourceDisplay: row.resourceDisplay,
    title: row.title,
    description: row.description,
    performedBy: row.performedBy,
    performedEmail: row.performedEmail,
    performedRole: row.performedRole,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    sessionId: row.sessionId,
    correlationId: row.correlationId,
    metadata: row.metadata,
    createdAt: row.createdAt,
  };
}

export function mapSystemActivityLogList(rows: SystemActivityLog[]): SystemActivityLogRecord[] {
  return rows.map(mapSystemActivityLog);
}
