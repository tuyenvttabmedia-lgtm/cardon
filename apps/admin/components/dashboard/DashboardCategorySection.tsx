'use client';

import { SectionShell } from '@/components/dashboard/SectionShell';
import { formatVnd } from '@/lib/utils';
import { vi } from '@/lib/i18n/vi';
import type { DashboardBreakdownItem } from '@/types/api';

const ACCENTS = [
  'border-teal-200 bg-teal-50/60',
  'border-blue-200 bg-blue-50/60',
  'border-amber-200 bg-amber-50/60',
  'border-violet-200 bg-violet-50/60',
  'border-slate-200 bg-slate-50/60',
];

export function DashboardCategorySection({
  breakdown,
  loading,
  error,
  onRetry,
}: {
  breakdown: DashboardBreakdownItem[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (!loading && (!breakdown || breakdown.length === 0) && !error) {
    return null;
  }

  return (
    <SectionShell
      title={vi.dashboard.categoryTitle}
      loading={loading}
      error={error}
      onRetry={onRetry}
      skeletonCount={4}
    >
      {breakdown && breakdown.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {breakdown.slice(0, 4).map((item, idx) => (
            <div
              key={item.service}
              className={`rounded-xl border p-4 ${ACCENTS[idx % ACCENTS.length]}`}
            >
              <p className="text-sm font-medium text-slate-600">{item.label}</p>
              <p className="mt-2 text-xl font-bold tabular-nums text-slate-900">
                {formatVnd(item.revenue)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {item.orderCount} đơn · {item.sharePercent}%
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/80">
                <div
                  className="h-full rounded-full bg-slate-700/70"
                  style={{ width: `${Math.min(100, item.sharePercent)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </SectionShell>
  );
}
