'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Form';
import { SectionShell } from '@/components/dashboard/SectionShell';
import { DASHBOARD_ROUTES } from '@/components/dashboard/dashboard-links';
import { cn } from '@/lib/utils';
import { vi } from '@/lib/i18n/vi';

function AlertRow({
  label,
  value,
  hint,
  href,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  href?: string;
  tone: 'warning' | 'danger' | 'ok';
}) {
  const shell = cn(
    'flex items-start justify-between gap-3 rounded-xl border px-4 py-3',
    tone === 'danger' && 'border-rose-200 bg-rose-50/70',
    tone === 'warning' && 'border-amber-200 bg-amber-50/70',
    tone === 'ok' && 'border-slate-200 bg-white',
    href && 'transition hover:border-admin-200 hover:shadow-sm',
  );
  const body = (
    <>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
      </div>
      <p
        className={cn(
          'shrink-0 text-2xl font-bold tabular-nums',
          tone === 'danger' && 'text-rose-700',
          tone === 'warning' && 'text-amber-700',
          tone === 'ok' && 'text-slate-700',
        )}
      >
        {value}
      </p>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={shell}>
        {body}
      </Link>
    );
  }
  return <div className={shell}>{body}</div>;
}

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
  const failed = failedAttemptCount ?? 0;
  const errors = providerErrors ?? 0;

  return (
    <SectionShell
      title={vi.dashboard.alertsTitle}
      subtitle={vi.dashboard.alertsScope}
      loading={loading}
      error={error}
      onRetry={onRetry}
      skeletonCount={2}
      actions={
        <div className="flex flex-wrap gap-1">
          {canPayments ? (
            <Link href={DASHBOARD_ROUTES.payments}>
              <Button type="button" variant="ghost" size="sm">
                {vi.dashboard.paymentsLink} →
              </Button>
            </Link>
          ) : null}
          {canProviders ? (
            <Link href={DASHBOARD_ROUTES.providers}>
              <Button type="button" variant="ghost" size="sm">
                {vi.dashboard.providersLink} →
              </Button>
            </Link>
          ) : null}
          {canOperations ? (
            <Link href={DASHBOARD_ROUTES.operations}>
              <Button type="button" variant="ghost" size="sm">
                {vi.dashboard.operationsLink} →
              </Button>
            </Link>
          ) : null}
        </div>
      }
    >
      {failedAttemptCount != null && providerErrors != null ? (
        <div className="space-y-2">
          <AlertRow
            label={vi.dashboard.paymentFailedAttempts}
            value={failed}
            hint={vi.dashboard.paymentFailedHint}
            href={canPayments ? DASHBOARD_ROUTES.payments : undefined}
            tone={failed > 0 ? 'warning' : 'ok'}
          />
          <AlertRow
            label={
              providerErrorsScope === 'SYSTEM'
                ? vi.dashboard.providerErrorsSystem
                : vi.dashboard.providerErrors
            }
            value={errors}
            hint={vi.dashboard.providerErrorsHint}
            href={canProviders ? DASHBOARD_ROUTES.providers : undefined}
            tone={errors > 0 ? 'danger' : 'ok'}
          />
        </div>
      ) : null}
    </SectionShell>
  );
}
