export type IntegritySeverity = 'ok' | 'warning' | 'error';

export type IntegrityDomain =
  | 'product'
  | 'category'
  | 'category_integrity'
  | 'variant'
  | 'provider_mapping'
  | 'provider'
  | 'payment'
  | 'email'
  | 'queue'
  | 'storage'
  | 'seo';

export interface IntegrityFinding {
  id: string;
  domain: IntegrityDomain;
  severity: IntegritySeverity;
  entityType: string;
  entityId?: string;
  entityLabel: string;
  message: string;
  autoFixable: boolean;
  fixAction?: string;
}

export interface IntegrityDomainSummary {
  domain: IntegrityDomain;
  label: string;
  status: IntegritySeverity;
  okCount: number;
  warningCount: number;
  errorCount: number;
}

export interface IntegrityReport {
  runAt: string;
  durationMs: number;
  healthScore: number;
  status: IntegritySeverity;
  productionLabel?: string;
  summary: {
    ok: number;
    warning: number;
    error: number;
  };
  domains: IntegrityDomainSummary[];
  findings: IntegrityFinding[];
  operations?: unknown;
  scanState?: {
    running: boolean;
    startedAt: string | null;
    completedAt: string | null;
  };
}

export interface AutoFixResult {
  applied: number;
  skipped: number;
  actions: Array<{ findingId: string; action: string; success: boolean; message?: string }>;
}

export const DOMAIN_LABELS: Record<IntegrityDomain, string> = {
  product: 'Product',
  category: 'Category',
  category_integrity: 'Category Integrity',
  variant: 'Variant',
  provider_mapping: 'Provider Mapping',
  provider: 'Provider',
  payment: 'Payment',
  email: 'Email',
  queue: 'Queue',
  storage: 'Storage',
  seo: 'SEO',
};

export function computeHealthScore(summary: { ok: number; warning: number; error: number }): number {
  const total = summary.ok + summary.warning + summary.error;
  if (total === 0) return 100;
  const weighted = summary.ok + summary.warning * 0.5;
  return Math.round((weighted / total) * 100);
}

export function overallStatus(summary: { warning: number; error: number }): IntegritySeverity {
  if (summary.error > 0) return 'error';
  if (summary.warning > 0) return 'warning';
  return 'ok';
}
