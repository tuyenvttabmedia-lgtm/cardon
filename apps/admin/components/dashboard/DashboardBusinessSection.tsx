'use client';

import Link from 'next/link';
import { SectionShell } from '@/components/dashboard/SectionShell';
import {
  CompareBadge,
  Sparkline,
  seriesToSparkValues,
} from '@/components/dashboard/dashboard-charts';
import {
  ordersCreatedPeriodHref,
  ordersPaidPeriodHref,
} from '@/components/dashboard/dashboard-links';
import { cn, formatVnd } from '@/lib/utils';
import { vi } from '@/lib/i18n/vi';
import type {
  DashboardBusinessStats,
  DashboardCompareStats,
  DashboardPaymentAttempts,
  DashboardPeriodInfo,
  DashboardSeriesPoint,
} from '@/types/api';

function KpiCard({
  label,
  value,
  href,
  hint,
  compare,
  spark,
  sparkStroke,
  tone = 'default',
}: {
  label: string;
  value: string;
  href?: string;
  hint?: string;
  compare?: number | null;
  spark?: number[];
  sparkStroke?: string;
  tone?: 'default' | 'success';
}) {
  const shell = cn(
    'group relative block h-full overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 shadow-panel sm:p-5',
    href &&
      'transition-all duration-200 hover:-translate-y-0.5 hover:border-admin-200 hover:shadow-panel-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-500/40',
  );
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {compare !== undefined ? <CompareBadge value={compare ?? null} /> : null}
      </div>
      <p
        className={cn(
          'mt-2 text-2xl font-bold tracking-tight tabular-nums',
          tone === 'success' ? 'text-emerald-700' : 'text-slate-900',
        )}
      >
        {value}
      </p>
      {spark && spark.length > 1 ? (
        <div className="mt-3">
          <Sparkline values={spark} stroke={sparkStroke} />
        </div>
      ) : null}
      {hint ? <p className="mt-1 text-[11px] text-slate-400">{hint}</p> : null}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={shell}>
        {body}
      </Link>
    );
  }
  return <div className={shell}>{body}</div>;
}

export function DashboardBusinessSection({
  period,
  business,
  payments,
  compare,
  series,
  loading,
  error,
  onRetry,
}: {
  period: DashboardPeriodInfo | null;
  business: DashboardBusinessStats | null;
  payments: DashboardPaymentAttempts | null;
  compare: DashboardCompareStats | null;
  series: DashboardSeriesPoint[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const paidHref = period ? ordersPaidPeriodHref(period) : undefined;
  const createdHref = period ? ordersCreatedPeriodHref(period) : undefined;
  const spark = series ? seriesToSparkValues(series) : [];

  return (
    <SectionShell
      title={vi.dashboard.businessTitle}
      subtitle={vi.dashboard.businessScope}
      loading={loading}
      error={error}
      onRetry={onRetry}
      skeletonCount={5}
    >
      {business && payments ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard
            label={vi.dashboard.revenue}
            value={formatVnd(business.revenue)}
            href={paidHref}
            compare={compare?.revenuePercent}
            spark={spark}
            sparkStroke="#0f766e"
            hint={period ? vi.dashboard.paidAtVsCreatedAtHint : undefined}
          />
          <KpiCard
            label={vi.dashboard.profit}
            value={formatVnd(business.profit)}
            href={paidHref}
            tone="success"
            compare={compare?.profitPercent}
            spark={series ? series.map((p) => Number(p.profit) || 0) : []}
            sparkStroke="#2563eb"
          />
          <KpiCard
            label={vi.dashboard.paidOrders}
            value={String(business.paidOrderCount)}
            href={paidHref}
            compare={compare?.paidOrderPercent}
            spark={series ? series.map((p) => p.paidOrders) : []}
            sparkStroke="#d97706"
          />
          <KpiCard
            label={vi.dashboard.averageOrderValue}
            value={formatVnd(business.averageOrderValue)}
            href={paidHref}
            compare={compare?.averageOrderValuePercent}
            hint={vi.dashboard.averageOrderValueHint}
          />
          <KpiCard
            label={vi.dashboard.createdOrders}
            value={String(business.createdOrderCount)}
            href={createdHref}
            hint={vi.dashboard.paymentSuccessAttempts + ': ' + payments.successAttemptCount}
          />
        </div>
      ) : null}
    </SectionShell>
  );
}
