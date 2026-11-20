'use client';

import Link from 'next/link';
import { EmptyState } from '@/components/ui/Display';
import { Button } from '@/components/ui/Form';
import { SectionShell } from '@/components/dashboard/SectionShell';
import { DASHBOARD_ROUTES, ordersBacklogHref } from '@/components/dashboard/dashboard-links';
import { cn } from '@/lib/utils';
import { vi } from '@/lib/i18n/vi';
import type { DashboardBacklog } from '@/types/api';

type BacklogKey = keyof DashboardBacklog;

const ROWS: {
  key: BacklogKey;
  label: string;
  href: string;
  bar: string;
  tone: string;
}[] = [
  {
    key: 'pendingDelivery',
    label: vi.dashboard.pendingDelivery,
    href: ordersBacklogHref('pending'),
    bar: 'bg-amber-400',
    tone: 'text-amber-700',
  },
  {
    key: 'processing',
    label: vi.dashboard.processing,
    href: ordersBacklogHref('processing'),
    bar: 'bg-sky-400',
    tone: 'text-sky-700',
  },
  {
    key: 'waitingAdminRetry',
    label: vi.dashboard.waitingAdminRetry,
    href: ordersBacklogHref('waitingRetry'),
    bar: 'bg-rose-400',
    tone: 'text-rose-700',
  },
  {
    key: 'needManualReview',
    label: vi.dashboard.needManualReview,
    href: ordersBacklogHref('needReview'),
    bar: 'bg-fuchsia-400',
    tone: 'text-fuchsia-700',
  },
];

export function DashboardOrderOpsSection({
  backlog,
  loading,
  error,
  onRetry,
}: {
  backlog: DashboardBacklog | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const total = backlog
    ? backlog.pendingDelivery +
      backlog.processing +
      backlog.waitingAdminRetry +
      backlog.needManualReview
    : 0;
  const max = Math.max(1, ...(backlog ? ROWS.map((r) => backlog[r.key]) : [1]));

  return (
    <SectionShell
      title={vi.dashboard.orderOpsTitle}
      subtitle={vi.dashboard.orderOpsScope}
      loading={loading}
      error={error}
      onRetry={onRetry}
      skeletonCount={1}
      actions={
        <Link href={DASHBOARD_ROUTES.esimOps}>
          <Button type="button" variant="ghost" size="sm">
            {vi.dashboard.esimOpsLink} →
          </Button>
        </Link>
      }
    >
      {backlog ? (
        total === 0 ? (
          <EmptyState message={vi.dashboard.backlogEmpty} />
        ) : (
          <div className="space-y-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-panel">
            {ROWS.map((row) => {
              const value = backlog[row.key];
              const width = Math.max(4, Math.round((value / max) * 100));
              return (
                <Link
                  key={row.key}
                  href={row.href}
                  className="block rounded-lg px-1 py-1 transition hover:bg-slate-50"
                >
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-slate-700">{row.label}</span>
                    <span className={cn('font-semibold tabular-nums', row.tone)}>{value}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={cn('h-full rounded-full transition-all', row.bar)}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </Link>
              );
            })}
            <p className="pt-1 text-xs text-slate-400">Tổng tồn: {total}</p>
          </div>
        )
      ) : null}
    </SectionShell>
  );
}
