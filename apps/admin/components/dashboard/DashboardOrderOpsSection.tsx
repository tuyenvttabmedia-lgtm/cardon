'use client';

import Link from 'next/link';
import { EmptyState, StatCard } from '@/components/ui/Display';
import { Button } from '@/components/ui/Form';
import { SectionShell } from '@/components/dashboard/SectionShell';
import { DASHBOARD_ROUTES, ordersBacklogHref } from '@/components/dashboard/dashboard-links';
import { vi } from '@/lib/i18n/vi';
import type { DashboardBacklog } from '@/types/api';

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

  return (
    <SectionShell
      title={vi.dashboard.orderOpsTitle}
      subtitle={vi.dashboard.orderOpsScope}
      loading={loading}
      error={error}
      onRetry={onRetry}
      skeletonCount={4}
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
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={vi.dashboard.pendingDelivery}
              value={String(backlog.pendingDelivery)}
              href={ordersBacklogHref('pending')}
              tone={backlog.pendingDelivery > 0 ? 'warning' : 'default'}
            />
            <StatCard
              label={vi.dashboard.processing}
              value={String(backlog.processing)}
              href={ordersBacklogHref('processing')}
              tone={backlog.processing > 0 ? 'warning' : 'default'}
            />
            <StatCard
              label={vi.dashboard.waitingAdminRetry}
              value={String(backlog.waitingAdminRetry)}
              href={ordersBacklogHref('waitingRetry')}
              tone={backlog.waitingAdminRetry > 0 ? 'danger' : 'default'}
            />
            <StatCard
              label={vi.dashboard.needManualReview}
              value={String(backlog.needManualReview)}
              href={ordersBacklogHref('needReview')}
              tone={backlog.needManualReview > 0 ? 'danger' : 'default'}
            />
          </div>
        )
      ) : null}
    </SectionShell>
  );
}
