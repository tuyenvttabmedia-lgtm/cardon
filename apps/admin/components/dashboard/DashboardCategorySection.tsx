'use client';

import { SectionShell } from '@/components/dashboard/SectionShell';
import { formatVnd } from '@/lib/utils';
import { vi } from '@/lib/i18n/vi';
import type { DashboardBreakdownItem, DashboardHomeService } from '@/types/api';

const SLOT_ORDER: DashboardHomeService[] = [
  'ESIM',
  'GAME_CARD',
  'PHONE_CARD',
  'TOPUP',
];

const LABELS: Record<string, string> = {
  ESIM: 'eSIM du lịch',
  GAME_CARD: 'Thẻ game',
  PHONE_CARD: 'Thẻ điện thoại',
  TOPUP: 'Nạp cước',
  DATA: 'Data / 3G-4G',
  OTHER: 'Khác',
};

const ACCENTS = [
  'border-violet-200 bg-violet-50/60',
  'border-teal-200 bg-teal-50/60',
  'border-blue-200 bg-blue-50/60',
  'border-amber-200 bg-amber-50/60',
];

/** Always show the 4 mockup product lanes (0đ when no paid volume). */
export function buildCategorySlots(
  breakdown: DashboardBreakdownItem[] | null,
): DashboardBreakdownItem[] {
  const byService = new Map((breakdown ?? []).map((row) => [row.service, row]));
  return SLOT_ORDER.map((service) => {
    const hit = byService.get(service);
    return (
      hit ?? {
        service,
        label: LABELS[service] ?? service,
        revenue: '0.00',
        orderCount: 0,
        sharePercent: 0,
      }
    );
  });
}

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
  const slots = buildCategorySlots(breakdown);

  return (
    <SectionShell
      title={vi.dashboard.categoryTitle}
      subtitle={vi.dashboard.categoryScope}
      loading={loading}
      error={error}
      onRetry={onRetry}
      skeletonCount={4}
    >
      {!loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {slots.map((item, idx) => (
            <div
              key={item.service}
              className={`rounded-xl border p-4 ${ACCENTS[idx % ACCENTS.length]}`}
            >
              <p className="text-sm font-medium text-slate-600">
                {LABELS[item.service] ?? item.label}
              </p>
              <p className="mt-2 text-xl font-bold tabular-nums text-slate-900">
                {formatVnd(item.revenue)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {item.orderCount} đơn · {item.sharePercent}%
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/80">
                <div
                  className="h-full rounded-full bg-slate-700/70"
                  style={{ width: `${Math.min(100, Math.max(0, item.sharePercent))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </SectionShell>
  );
}
