'use client';

import Link from 'next/link';
import { Badge, Card } from '@/components/ui/Display';
import { Button } from '@/components/ui/Form';
import { SectionShell } from '@/components/dashboard/SectionShell';
import { DASHBOARD_ROUTES } from '@/components/dashboard/dashboard-links';
import { formatDateTime } from '@/lib/utils';
import { vi } from '@/lib/i18n/vi';
import type { SystemHealthSummary } from '@/types/api';

function serviceMark(status?: string) {
  if (status === 'ok') return '✓';
  if (!status || status === 'unknown') return '·';
  return '⚠';
}

export function DashboardHealthSection({
  health,
  loading,
  error,
  canOpenReport,
  canOpenMonitoring,
  onRetry,
}: {
  health: SystemHealthSummary | null;
  loading: boolean;
  error: string | null;
  canOpenReport: boolean;
  canOpenMonitoring: boolean;
  onRetry: () => void;
}) {
  const scanned = Boolean(health?.scanAvailable && health.runAt);
  const score =
    scanned && typeof health?.healthScore === 'number' ? `${health.healthScore}%` : '—';
  const label = scanned
    ? health?.productionLabel || health?.categoryIntegrity?.label || '—'
    : vi.dashboard.healthNotScanned;

  return (
    <SectionShell
      title={vi.dashboard.healthTitle}
      loading={loading}
      error={error ? vi.dashboard.healthLoadError : null}
      onRetry={error ? onRetry : undefined}
      skeletonCount={1}
    >
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="text-sm text-slate-500">{vi.dashboard.healthScore}</p>
            <p className="text-3xl font-bold tracking-tight text-slate-950">{score}</p>
            <p className="text-sm font-medium text-slate-700">{label}</p>
            <p className="text-xs text-slate-500">
              {vi.dashboard.healthLastScan}:{' '}
              {health?.lastScanAt || health?.runAt
                ? formatDateTime(String(health.lastScanAt || health.runAt))
                : '—'}
            </p>
          </div>

          <div className="min-w-0 space-y-2 text-xs text-slate-600 sm:text-right">
            {health?.systemVersion ? (
              <>
                <p>
                  Version: <strong>{health.systemVersion.build}</strong>
                </p>
                <p className="break-words">
                  API {serviceMark(health.systemVersion.services.api.status)}
                  {' · '}WEB {serviceMark(health.systemVersion.services.web.status)}
                  {' · '}ADMIN {serviceMark(health.systemVersion.services.admin.status)}
                  {' · '}WORKER {serviceMark(health.systemVersion.services.worker.status)}
                </p>
                {health.versionMismatch ? (
                  <Badge tone="warning">{vi.settings.versionMismatch}</Badge>
                ) : null}
              </>
            ) : (
              <p className="text-slate-400">{scanned ? '—' : vi.dashboard.healthNotScanned}</p>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {canOpenMonitoring ? (
            <Link href={DASHBOARD_ROUTES.monitoring}>
              <Button type="button" variant="secondary" size="sm">
                {vi.dashboard.healthMonitoring}
              </Button>
            </Link>
          ) : null}
          {canOpenReport ? (
            <Link href={DASHBOARD_ROUTES.healthReport}>
              <Button type="button" variant="secondary" size="sm">
                {vi.dashboard.healthReport}
              </Button>
            </Link>
          ) : null}
        </div>
      </Card>
    </SectionShell>
  );
}
