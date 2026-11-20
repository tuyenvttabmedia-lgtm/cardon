'use client';

import { useMemo, useState } from 'react';
import { Card, EmptyState } from '@/components/ui/Display';
import { SectionShell } from '@/components/dashboard/SectionShell';
import { buildCategorySlots } from '@/components/dashboard/DashboardCategorySection';
import {
  BreakdownDonut,
  RevenueLineChart,
  type DashboardChartMetric,
} from '@/components/dashboard/dashboard-charts';
import { cn, formatVnd } from '@/lib/utils';
import { vi } from '@/lib/i18n/vi';
import type { DashboardBreakdownItem, DashboardSeriesPoint } from '@/types/api';

const METRICS: { id: DashboardChartMetric; label: string }[] = [
  { id: 'revenue', label: vi.dashboard.chartTabRevenue },
  { id: 'orders', label: vi.dashboard.chartTabOrders },
  { id: 'profit', label: vi.dashboard.chartTabProfit },
];

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
  const [metric, setMetric] = useState<DashboardChartMetric>('revenue');
  const hasSeries = Boolean(
    series?.some((p) =>
      metric === 'orders'
        ? p.paidOrders > 0
        : metric === 'profit'
          ? Number(p.profit) > 0
          : Number(p.revenue) > 0,
    ),
  );
  /** Always include eSIM / game / phone / topup so legend shows Nạp cước color at 0%. */
  const donutItems = useMemo(() => buildCategorySlots(breakdown), [breakdown]);
  const hasBreakdown = Boolean(breakdown && breakdown.length > 0);
  const breakdownTotal = useMemo(() => {
    return donutItems.reduce((sum, row) => sum + (Number(row.revenue) || 0), 0);
  }, [donutItems]);

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
              <div
                className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5"
                role="tablist"
                aria-label={vi.dashboard.seriesTitle}
              >
                {METRICS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={metric === item.id}
                    onClick={() => setMetric(item.id)}
                    className={cn(
                      'rounded-md px-2.5 py-1 text-[11px] font-medium transition',
                      metric === item.id
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800',
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            {!hasSeries ? (
              <EmptyState message={vi.dashboard.seriesEmpty} />
            ) : (
              <RevenueLineChart series={series} metric={metric} />
            )}
          </Card>

          <Card className="space-y-3 p-4 lg:col-span-2">
            <p className="text-sm font-semibold text-slate-800">{vi.dashboard.breakdownTitle}</p>
            {!hasBreakdown && breakdownTotal === 0 ? (
              <EmptyState message={vi.dashboard.breakdownEmpty} />
            ) : (
              <>
                <BreakdownDonut
                  items={donutItems}
                  centerLabel={
                    breakdownTotal > 0
                      ? formatVnd(breakdownTotal)
                      : undefined
                  }
                />
                <ul className="divide-y divide-slate-100 border-t border-slate-100 pt-2">
                  {donutItems.map((item) => (
                    <li
                      key={item.service}
                      className="flex items-center justify-between gap-2 py-1.5 text-xs"
                    >
                      <span
                        className={
                          item.orderCount > 0 ? 'text-slate-600' : 'text-slate-400'
                        }
                      >
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
