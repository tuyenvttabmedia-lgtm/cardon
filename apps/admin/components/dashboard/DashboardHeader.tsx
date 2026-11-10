'use client';

import { Button } from '@/components/ui/Form';
import { cn, formatDateTime } from '@/lib/utils';
import { vi } from '@/lib/i18n/vi';
import type { DashboardPeriodPreset } from '@/types/api';

const PERIODS: { id: DashboardPeriodPreset; label: string }[] = [
  { id: 'today', label: vi.dashboard.periodToday },
  { id: 'last7', label: vi.dashboard.periodLast7 },
  { id: 'month', label: vi.dashboard.periodMonth },
];

export function DashboardHeader({
  period,
  asOf,
  refreshing,
  onPeriodChange,
  onRefresh,
}: {
  period: DashboardPeriodPreset;
  asOf: string | null;
  refreshing?: boolean;
  onPeriodChange: (period: DashboardPeriodPreset) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="admin-page-title">{vi.dashboard.title}</h1>
        <p className="text-sm text-slate-500">{vi.dashboard.subtitle}</p>
        {asOf ? (
          <p className="mt-1 text-xs text-slate-400">
            {vi.dashboard.updatedAt}: {formatDateTime(asOf)}
          </p>
        ) : null}
      </div>

      <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
        <div
          className="flex w-full min-w-0 flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 sm:w-auto"
          role="group"
          aria-label="Kỳ thời gian"
        >
          {PERIODS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onPeriodChange(item.id)}
              className={cn(
                'min-h-9 flex-1 rounded-md px-3 text-sm font-medium transition sm:flex-none',
                period === item.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onRefresh}
          disabled={refreshing}
          className="w-full sm:w-auto"
        >
          {refreshing ? vi.app.loading : vi.dashboard.refresh}
        </Button>
      </div>
    </div>
  );
}
