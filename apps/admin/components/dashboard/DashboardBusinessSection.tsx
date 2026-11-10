'use client';

import { StatCard } from '@/components/ui/Display';
import { SectionShell } from '@/components/dashboard/SectionShell';
import {
  ordersCreatedPeriodHref,
  ordersPaidPeriodHref,
} from '@/components/dashboard/dashboard-links';
import { formatVnd } from '@/lib/utils';
import { vi } from '@/lib/i18n/vi';
import type { DashboardBusinessStats, DashboardPaymentAttempts, DashboardPeriodInfo } from '@/types/api';

export function DashboardBusinessSection({
  period,
  business,
  payments,
  loading,
  error,
  onRetry,
}: {
  period: DashboardPeriodInfo | null;
  business: DashboardBusinessStats | null;
  payments: DashboardPaymentAttempts | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const paidHref = period ? ordersPaidPeriodHref(period) : undefined;
  const createdHref = period ? ordersCreatedPeriodHref(period) : undefined;

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
          <StatCard
            label={vi.dashboard.revenue}
            value={formatVnd(business.revenue)}
            href={paidHref}
            hint={period ? vi.dashboard.paidAtVsCreatedAtHint : undefined}
          />
          <StatCard
            label={vi.dashboard.profit}
            value={formatVnd(business.profit)}
            href={paidHref}
            tone="success"
            hint={period ? vi.dashboard.paidAtVsCreatedAtHint : undefined}
          />
          <StatCard
            label={vi.dashboard.paidOrders}
            value={String(business.paidOrderCount)}
            href={paidHref}
            hint={period ? vi.dashboard.paidAtVsCreatedAtHint : undefined}
          />
          <StatCard
            label={vi.dashboard.createdOrders}
            value={String(business.createdOrderCount)}
            href={createdHref}
          />
          <StatCard
            label={vi.dashboard.paymentSuccessAttempts}
            value={String(payments.successAttemptCount)}
            hint={vi.dashboard.paymentSuccessHint}
          />
        </div>
      ) : null}
    </SectionShell>
  );
}
