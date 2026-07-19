import type { IntegritySeverity } from '../../product/entities/integrity.types';

export type ChecklistStatus = 'pass' | 'warning' | 'error';

export type PaymentGatewayRole = 'active' | 'coming_soon';

export interface PaymentGatewayStatus {
  id: string;
  label: string;
  role?: PaymentGatewayRole;
  priority?: number;
  priorityLabel?: string;
  enabled?: boolean;
  configured?: boolean;
  secretsProtected?: boolean;
  apiOk?: boolean;
  healthy?: boolean;
  lastCheckAt?: string | null;
  comingSoon?: boolean;
  environment?: string;
  checks?: string[];
}

export interface ProviderOpsStatus {
  id: string;
  code: string;
  name: string;
  status: string;
  healthStatus: string;
  balance: string | null;
  lastSyncAt: string | null;
  apiLatencyMs: number | null;
}

export interface QueueOpsStatus {
  waiting: number;
  processing: number;
  completed: number;
  failed: number;
  redisStatus: 'ok' | 'error' | 'unknown';
  queues: Array<{ name: string; waiting: number; active: number; completed: number; failed: number }>;
}

export interface StorageOpsStatus {
  provider: 'wasabi' | 'local';
  bucket: string | null;
  region: string | null;
  latencyMs: number | null;
  objectCount: number | null;
  freeSpaceBytes: number | null;
  status: ChecklistStatus;
}

export interface SmtpOpsStatus {
  connected: boolean;
  tls: boolean;
  host: string | null;
  lastSendAt: string | null;
  queueDepth: number;
  status: ChecklistStatus;
}

export interface SeoOpsStatus {
  robotsConfigured: boolean;
  sitemapEnabled: boolean;
  canonicalIssues: number;
  brokenLinks: number;
  missingMeta: number;
  missingOg: number;
  notFoundPages: number;
  status: ChecklistStatus;
}

export interface CronOpsStatus {
  running: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  schedule: string;
}

export interface TelegramOpsStatus {
  connected: boolean;
  chatId: string | null;
  lastMessageAt: string | null;
  enabled: boolean;
}

export interface ProductionChecklistItem {
  id: string;
  label: string;
  status: ChecklistStatus;
  detail?: string;
}

import type { SystemVersionInfo } from '../services/system-version.service';

export interface OperationsDashboard {
  productionLabel: string;
  healthScore: number;
  overallStatus: IntegritySeverity;
  payment: PaymentGatewayStatus[];
  providers: ProviderOpsStatus[];
  queue: QueueOpsStatus;
  storage: StorageOpsStatus;
  smtp: SmtpOpsStatus;
  seo: SeoOpsStatus;
  cron: CronOpsStatus;
  telegram: TelegramOpsStatus;
  checklist: ProductionChecklistItem[];
  buildVersion: string;
  environment: string;
  systemVersion?: SystemVersionInfo;
}

export function productionReadinessLabel(score: number, errorCount: number): string {
  if (errorCount > 0) return 'Needs Attention';
  if (score >= 90) return 'Production Ready';
  if (score >= 70) return 'Degraded';
  return 'Not Production Ready';
}

export function checklistToSeverity(items: ProductionChecklistItem[]): IntegritySeverity {
  if (items.some((i) => i.status === 'error')) return 'error';
  if (items.some((i) => i.status === 'warning')) return 'warning';
  return 'ok';
}
