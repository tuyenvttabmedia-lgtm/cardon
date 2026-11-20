'use client';

import { Card, EmptyState } from '@/components/ui/Display';
import { SectionShell } from '@/components/dashboard/SectionShell';
import {
  BreakdownDonut,
  RevenueLineChart,
} from '@/components/dashboard/dashboard-charts';
import { formatVnd } from '@/lib/utils';
import { vi } from '@/lib/i18n/vi';
import type { DashboardBreakdownItem, DashboardSeriesPoint } from '@/types/api';

export function DashboardChartsSection({
  series,
  breakdown,
  loading,
  error,
  onRetry,
}: {
  series: DashboardSeriesPoint[] | null;
  breakdown: DashboardBreakdownItem[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const hasSeries = Boolean(series?.some((p) => Number(p.revenue) > 0));
  const hasBreakdown = Boolean(breakdown && breakdown.length > 0);

  return (
    <SectionShell
      title={vi.dashboard.chartsTitle}
      subtitle={vi.dashboard.chartsScope}
      loading={loading}
      error={error}
      onRetry={onRetry}
      skeletonCount={2}
    >
      {series && breakdown ? (
        <div className="grid gap-3 lg:grid-cols-5">
          <Card className="space-y-3 p-4 lg:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-800">{vi.dashboard.seriesTitle}</p>
              <div className="flex items-center gap-3 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-0.5 w-4 rounded bg-teal-700" />
                  {vi.dashboard.seriesRevenue}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-0.5 w-4 rounded border-t-2 border-dashed border-blue-600" />
                  {vi.dashboard.seriesProfit}
                </span>
              </div>
            </div>
            {!hasSeries ? (
              <EmptyState message={vi.dashboard.seriesEmpty} />
            ) : (
              <RevenueLineChart series={series} />
            )}
          </Card>

          <Card className="space-y-3 p-4 lg:col-span-2">
            <p className="text-sm font-semibold text-slate-800">{vi.dashboard.breakdownTitle}</p>
            {!hasBreakdown ? (
              <EmptyState message={vi.dashboard.breakdownEmpty} />
            ) : (
              <>
                <BreakdownDonut items={breakdown} />
                <ul className="divide-y divide-slate-100 border-t border-slate-100 pt-2">
                  {breakdown.map((item) => (
                    <li
                      key={item.service}
                      className="flex items-center justify-between gap-2 py-1.5 text-xs"
                    >
                      <span className="text-slate-600">
                        {item.label} · {item.orderCount} đơn
                      </span>
                      <span className="font-medium tabular-nums text-slate-800">
                        {formatVnd(item.revenue)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </div>
      ) : null}
    </SectionShell>
  );
}
