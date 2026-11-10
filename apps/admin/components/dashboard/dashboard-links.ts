import type { DashboardPeriodInfo } from '@/types/api';

/** Orders list URL params verified in OrdersListPageClient. */
export function ordersPaidPeriodHref(period: DashboardPeriodInfo): string {
  const q = new URLSearchParams({
    preset: 'custom',
    from: period.dateFrom,
    to: period.dateTo,
    payment: 'PAID',
  });
  return `/orders?${q.toString()}`;
}

export function ordersCreatedPeriodHref(period: DashboardPeriodInfo): string {
  const q = new URLSearchParams({
    preset: 'custom',
    from: period.dateFrom,
    to: period.dateTo,
  });
  return `/orders?${q.toString()}`;
}

export function ordersBacklogHref(
  bucket: 'pending' | 'processing' | 'waitingRetry' | 'needReview',
): string {
  if (bucket === 'pending') return '/orders?ex=pending';
  if (bucket === 'processing') return '/orders?ex=processing';
  if (bucket === 'waitingRetry') return '/orders?ex=attention';
  return '/orders?ex=attention&attn=NEED_MANUAL_REVIEW';
}

export const DASHBOARD_ROUTES = {
  payments: '/payments',
  providers: '/providers',
  operations: '/operations',
  agentsOverview: '/agents/overview',
  monitoring: '/monitoring',
  activity: '/monitoring/activity',
  healthReport: '/configuration/health',
  esimOps: '/esim-ops',
} as const;
