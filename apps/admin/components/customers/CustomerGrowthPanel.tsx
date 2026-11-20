'use client';

import { useMemo } from 'react';
import { Card, ErrorMessage, StatCard } from '@/components/ui/Display';
import { Button } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';
import { cn } from '@/lib/utils';
import type { AdminCustomerStats, AdminCustomerStatsPeriod } from '@/types/api';

const PERIODS: AdminCustomerStatsPeriod[] = ['today', '7d', '30d', '90d'];
const CHART_MAX_PX = 120;

function periodLabel(period: AdminCustomerStatsPeriod): string {
  if (period === 'today') return vi.customers.statsPeriodToday;
  if (period === '7d') return vi.customers.statsPeriod7d;
  if (period === '90d') return vi.customers.statsPeriod90d;
  return vi.customers.statsPeriod30d;
}

export function CustomerGrowthPanel({
  stats,
  period,
  loading,
  error,
  onPeriodChange,
  onRetry,
}: {
  stats: AdminCustomerStats | null;
  period: AdminCustomerStatsPeriod;
  loading: boolean;
  error: string | null;
  onPeriodChange: (period: AdminCustomerStatsPeriod) => void;
  onRetry: () => void;
}) {
  const maxSignups = useMemo(() => {
    if (!stats?.series.length) return 1;
    return Math.max(1, ...stats.series.map((d) => d.signups));
  }, [stats]);

  const hasSeriesActivity = Boolean(stats?.series.some((d) => d.signups > 0));

  return (
    <Card className="space-y-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">{vi.customers.statsTitle}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{vi.customers.statsSubtitle}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {PERIODS.map((p) => (
            <Button
              key={p}
              size="sm"
              variant={period === p ? 'primary' : 'ghost'}
              disabled={loading}
              onClick={() => onPeriodChange(p)}
            >
              {periodLabel(p)}
            </Button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="space-y-2">
          <ErrorMessage message={error} />
          <Button size="sm" variant="secondary" onClick={onRetry}>
            {vi.customers.statsRetry}
          </Button>
        </div>
      ) : null}

      {loading && !stats ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-[5.5rem] animate-pulse rounded-xl border border-slate-100 bg-slate-50"
            />
          ))}
        </div>
      ) : null}

      {stats ? (
        <>
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {vi.customers.statsInPeriodTitle} · {periodLabel(period)} · {stats.period.dateFrom}
              {stats.period.dateFrom !== stats.period.dateTo
                ? ` → ${stats.period.dateTo}`
                : ''}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard
                label={vi.customers.statsSignupsInPeriod}
                value={String(stats.inPeriod.signups)}
                hint={vi.customers.statsSignupsInPeriodHint}
                tone="accent"
                className="p-4"
              />
              <StatCard
                label={vi.customers.statsActive}
                value={String(stats.inPeriod.active)}
                tone="success"
                hint={`${vi.customers.statsSuspended}: ${stats.inPeriod.suspended} · ${vi.customers.statsBanned}: ${stats.inPeriod.banned}`}
                className="p-4"
              />
              <StatCard
                label={vi.customers.statsVerified}
                value={String(stats.inPeriod.emailVerified)}
                className="p-4"
              />
              <StatCard
                label={vi.customers.statsBuyers}
                value={String(stats.inPeriod.buyers)}
                hint={vi.customers.statsBuyersInPeriodHint}
                className="p-4"
              />
              <StatCard
                label={vi.customers.statsGuestBuyers}
                value={String(stats.inPeriod.guestBuyers)}
                hint={vi.customers.statsGuestBuyersHint}
                className="p-4"
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {vi.customers.statsLifetimeTitle}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label={vi.customers.statsTotal}
                value={String(stats.lifetime.total)}
                hint={vi.customers.statsTotalHint}
                className="p-4"
              />
              <StatCard
                label={vi.customers.statsActive}
                value={String(stats.lifetime.active)}
                tone="success"
                hint={`${vi.customers.statsSuspended}: ${stats.lifetime.suspended} · ${vi.customers.statsBanned}: ${stats.lifetime.banned}`}
                className="p-4"
              />
              <StatCard
                label={vi.customers.statsVerified}
                value={String(stats.lifetime.emailVerified)}
                className="p-4"
              />
              <StatCard
                label={vi.customers.statsBuyers}
                value={String(stats.lifetime.buyers)}
                hint={vi.customers.statsBuyersHint}
                className="p-4"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 sm:p-4">
            <div className="mb-3">
              <p className="text-sm font-medium text-slate-700">
                {vi.customers.statsSeriesTitle}
              </p>
              <p className="text-xs text-slate-500">
                {stats.period.dateFrom} → {stats.period.dateTo} · {stats.period.timezone} ·{' '}
                {vi.customers.statsNewInPeriod}: {stats.inPeriod.signups}
              </p>
            </div>
            {!hasSeriesActivity ? (
              <p className="py-8 text-center text-sm text-slate-400">
                {vi.customers.statsSeriesEmpty}
              </p>
            ) : (
              <div
                className="flex items-end gap-1 overflow-x-auto pb-1"
                style={{ height: CHART_MAX_PX + 28 }}
                role="img"
                aria-label={vi.customers.statsSeriesTitle}
              >
                {stats.series.map((point) => {
                  const barPx =
                    point.signups === 0
                      ? 3
                      : Math.max(10, Math.round((point.signups / maxSignups) * CHART_MAX_PX));
                  return (
                    <div
                      key={point.date}
                      className="group relative flex min-w-[10px] flex-1 flex-col items-center justify-end"
                      style={{ height: CHART_MAX_PX + 20 }}
                      title={`${point.date}: ${point.signups}`}
                    >
                      {point.signups > 0 ? (
                        <span className="mb-0.5 text-[10px] font-medium tabular-nums text-slate-600 opacity-0 group-hover:opacity-100 sm:opacity-100">
                          {point.signups}
                        </span>
                      ) : (
                        <span className="mb-0.5 h-3" />
                      )}
                      <div
                        className={cn(
                          'w-full max-w-[18px] rounded-t bg-admin-500 transition-all group-hover:bg-admin-600',
                          point.signups === 0 && 'bg-slate-200 group-hover:bg-slate-300',
                        )}
                        style={{ height: barPx }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : null}
    </Card>
  );
}
