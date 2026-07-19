import {
  SystemActivityEventCategory,
  SystemActivityEventType,
  SystemActivitySeverity,
  SystemActivitySource,
  UserRole,
} from '@prisma/client';

export interface SystemActivityLogRecord {
  id: string;
  eventType: SystemActivityEventType;
  eventCategory: SystemActivityEventCategory;
  severity: SystemActivitySeverity;
  source: SystemActivitySource;
  resource: string | null;
  resourceId: string | null;
  resourceDisplay: string | null;
  title: string;
  description: string | null;
  performedBy: string | null;
  performedEmail: string | null;
  performedRole: UserRole | null;
  ipAddress: string | null;
  userAgent: string | null;
  sessionId: string | null;
  correlationId: string | null;
  metadata: unknown;
  createdAt: Date;
}

export interface ActivityLogListResult {
  items: SystemActivityLogRecord[];
  total: number;
  page: number;
  limit: number;
  stats: {
    today: number;
    yesterday: number;
    thisWeek: number;
    total: number;
  };
}
