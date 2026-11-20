'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Form';
import { SectionShell } from '@/components/dashboard/SectionShell';
import { CompareBadge } from '@/components/dashboard/dashboard-charts';
import { DASHBOARD_ROUTES } from '@/components/dashboard/dashboard-links';
import { formatVnd } from '@/lib/utils';
import { vi } from '@/lib/i18n/vi';
import type { DashboardEsimLaneStats } from '@/types/api';

export function DashboardEsimLaneSection({
  esim,
  loading,
  error,
  onRetry,
}: {
  esim: DashboardEsimLaneStats | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <SectionShell
      title={vi.dashboard.esimLaneTitle}
      subtitle={vi.dashboard.esimLaneScope}
      loading={loading}
      error={error}
      onRetry={onRetry}
      skeletonCount={3}
      actions={
        <div className="flex flex-wrap gap-1">
          <Link href={DASHBOARD_ROUTES.esimOps}>
            <Button type="button" variant="ghost" size="sm">
              {vi.dashboard.esimOpsLink} →
            </Button>
          </Link>
          <Link href="/finance/esim">
            <Button type="button" variant="ghost" size="sm">
              {vi.dashboard.esimFinanceLink} →
            </Button>
          </Link>
        </div>
      }
    >
      {esim ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-violet-200/80 bg-violet-50/50 p-4 shadow-panel">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-slate-600">{vi.dashboard.esimRevenue}</p>
              <CompareBadge value={esim.compare.revenuePercent} />
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
              {formatVnd(esim.revenue)}
            </p>
          </div>
          <div className="rounded-xl border border-violet-200/80 bg-violet-50/50 p-4 shadow-panel">
            <p className="text-sm font-medium text-slate-600">{vi.dashboard.esimProfit}</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-emerald-700">
              {formatVnd(esim.profit)}
            </p>
          </div>
          <div className="rounded-xl border border-violet-200/80 bg-violet-50/50 p-4 shadow-panel">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-slate-600">{vi.dashboard.esimPaidOrders}</p>
              <CompareBadge value={esim.compare.paidOrderPercent} />
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
              {esim.paidOrderCount}
            </p>
          </div>
        </div>
      ) : null}
    </SectionShell>
  );
}
