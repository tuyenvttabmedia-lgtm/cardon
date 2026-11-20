'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/Display';
import { Button } from '@/components/ui/Form';
import { DASHBOARD_ROUTES } from '@/components/dashboard/dashboard-links';
import { cn, formatDateTime } from '@/lib/utils';
import { vi } from '@/lib/i18n/vi';
import type { SystemHealthSummary } from '@/types/api';

function serviceMark(status?: string) {
  if (status === 'ok') return '✓';
  if (!status || status === 'unknown') return '·';
  return '⚠';
}

/** Compact health chip — lives in header, not a full dashboard section. */
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
    scanned && typeof health?.healthScore === 'number' ? `${health.healthScore}%` : null;
  const tone = error
    ? 'border-amber-200 bg-amber-50 text-amber-900'
    : scanned
      ? 'border-emerald-200 bg-emerald-50/80 text-emerald-900'
      : 'border-slate-200 bg-slate-50 text-slate-700';

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs',
        tone,
      )}
    >
      <span className="font-semibold">{vi.dashboard.healthTitle}</span>
      {loading ? (
        <span className="text-slate-400">{vi.app.loading}</span>
      ) : error ? (
        <>
          <span className="text-amber-800">{vi.dashboard.healthLoadError}</span>
          <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
            {vi.dashboard.retry}
          </Button>
        </>
      ) : (
        <>
          <span className="tabular-nums">
            {vi.dashboard.healthScore}:{' '}
            <strong>{score ?? vi.dashboard.healthNotScanned}</strong>
          </span>
          {health?.systemVersion ? (
            <span className="hidden text-slate-500 sm:inline">
              API {serviceMark(health.systemVersion.services.api.status)}
              {' · '}W {serviceMark(health.systemVersion.services.worker.status)}
            </span>
          ) : null}
          {health?.versionMismatch ? (
            <Badge tone="warning">{vi.settings.versionMismatch}</Badge>
          ) : null}
          {(health?.lastScanAt || health?.runAt) && scanned ? (
            <span className="hidden text-slate-400 lg:inline">
              {formatDateTime(String(health.lastScanAt || health.runAt))}
            </span>
          ) : null}
        </>
      )}
      <span className="ml-auto flex flex-wrap gap-1">
        {canOpenMonitoring ? (
          <Link href={DASHBOARD_ROUTES.monitoring}>
            <Button type="button" variant="ghost" size="sm">
              {vi.dashboard.healthMonitoring}
            </Button>
          </Link>
        ) : null}
        {canOpenReport ? (
          <Link href={DASHBOARD_ROUTES.healthReport}>
            <Button type="button" variant="ghost" size="sm">
              {vi.dashboard.healthReport}
            </Button>
          </Link>
        ) : null}
      </span>
    </div>
  );
}
