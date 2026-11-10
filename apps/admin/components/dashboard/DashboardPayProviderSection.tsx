'use client';

import Link from 'next/link';
import { StatCard } from '@/components/ui/Display';
import { Button } from '@/components/ui/Form';
import { SectionShell } from '@/components/dashboard/SectionShell';
import { DASHBOARD_ROUTES } from '@/components/dashboard/dashboard-links';
import { vi } from '@/lib/i18n/vi';

export function DashboardPayProviderSection({
  failedAttemptCount,
  providerErrors,
  providerErrorsScope,
  loading,
  error,
  canPayments,
  canProviders,
  canOperations,
  onRetry,
}: {
  failedAttemptCount: number | null;
  providerErrors: number | null;
  providerErrorsScope: 'SYSTEM' | null;
  loading: boolean;
  error: string | null;
  canPayments: boolean;
  canProviders: boolean;
  canOperations: boolean;
  onRetry: () => void;
}) {
  return (
    <SectionShell
      title={vi.dashboard.payProviderTitle}
      loading={loading}
      error={error}
      onRetry={onRetry}
      skeletonCount={2}
      actions={
        <>
          {canPayments ? (
            <Link href={DASHBOARD_ROUTES.payments}>
              <Button type="button" variant="ghost" size="sm">
                {vi.dashboard.paymentsLink}
              </Button>
            </Link>
          ) : null}
          {canProviders ? (
            <Link href={DASHBOARD_ROUTES.providers}>
              <Button type="button" variant="ghost" size="sm">
                {vi.dashboard.providersLink}
              </Button>
            </Link>
          ) : null}
          {canOperations ? (
            <Link href={DASHBOARD_ROUTES.operations}>
              <Button type="button" variant="ghost" size="sm">
                {vi.dashboard.operationsLink}
              </Button>
            </Link>
          ) : null}
        </>
      }
    >
      {failedAttemptCount != null && providerErrors != null ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard
            label={vi.dashboard.paymentFailedAttempts}
            value={String(failedAttemptCount)}
            hint={vi.dashboard.paymentFailedHint}
            tone={failedAttemptCount > 0 ? 'danger' : 'default'}
            href={canPayments ? DASHBOARD_ROUTES.payments : undefined}
          />
          <StatCard
            label={vi.dashboard.providerErrorsSystem}
            value={String(providerErrors)}
            hint={
              providerErrorsScope === 'SYSTEM'
                ? vi.dashboard.providerErrorsHint
                : vi.dashboard.providerErrorsHint
            }
            tone={providerErrors > 0 ? 'danger' : 'default'}
            href={canProviders ? DASHBOARD_ROUTES.providers : undefined}
          />
        </div>
      ) : null}
    </SectionShell>
  );
}
