'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { RequirePermission } from '@/components/layout/AdminShell';
import {
  MonitoringActionBar,
  MonitoringLoadingState,
  MonitoringSectionHeader,
} from '@/components/monitoring/MonitoringUi';
import { Card, ErrorMessage, StatCard } from '@/components/ui/Display';
import { Button } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';
import { cn, formatDateTime } from '@/lib/utils';
import { ApiClientError, serverHealthApi } from '@/services/api-client';
import type { ServerHealthPack, ServerOverallStatus } from '@/types/api';

const REFRESH_OPTIONS = [
  { label: vi.serverHealth.refreshOff, value: 0 },
  { label: '10s', value: 10 },
  { label: '30s', value: 30 },
  { label: '60s', value: 60 },
] as const;

function overallTone(status: ServerOverallStatus): 'success' | 'warning' | 'danger' {
  if (status === 'OK') return 'success';
  if (status === 'DEGRADED') return 'warning';
  return 'danger';
}

function statusLabel(status: string): string {
  const map = vi.serverHealth.statusLabels as Record<string, string>;
  return map[status] ?? status;
}

function formatUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function ServerHealthPanel() {
  const [data, setData] = useState<ServerHealthPack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshSec, setRefreshSec] = useState(30);
  const [countdown, setCountdown] = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await serverHealthApi.get());
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : vi.serverHealth.loadError);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (refreshSec <= 0) return;
    setCountdown(refreshSec);
    const tick = window.setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          void load();
          return refreshSec;
        }
        return c - 1;
      });
    }, 1000);
    return () => window.clearInterval(tick);
  }, [refreshSec, load]);

  return (
    <RequirePermission permission="monitoring.server.read">
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <MonitoringSectionHeader
            title={vi.serverHealth.title}
            subtitle={vi.serverHealth.subtitle}
          />
          <MonitoringActionBar>
            <select
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={refreshSec}
              onChange={(e) => setRefreshSec(Number(e.target.value))}
            >
              {REFRESH_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label === vi.serverHealth.refreshOff
                    ? o.label
                    : `${vi.serverHealth.autoRefresh} ${o.label}`}
                </option>
              ))}
            </select>
            {refreshSec > 0 && (
              <span className="text-sm text-slate-500">
                {vi.serverHealth.countdown} {countdown}s
              </span>
            )}
            <Button type="button" onClick={() => void load()} disabled={loading}>
              {vi.app.refresh}
            </Button>
          </MonitoringActionBar>
        </div>

        {error && <ErrorMessage message={error} />}
        {loading && !data && <MonitoringLoadingState />}

        {data && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label={vi.serverHealth.overall}
                value={statusLabel(data.overall)}
                hint={data.ready ? vi.serverHealth.readyYes : vi.serverHealth.readyNo}
                tone={overallTone(data.overall)}
              />
              <StatCard
                label={vi.serverHealth.database}
                value={statusLabel(data.database.status)}
                hint={
                  data.database.latencyMs != null
                    ? `${data.database.latencyMs} ms`
                    : undefined
                }
                tone={data.database.status === 'ok' ? 'success' : 'danger'}
              />
              <StatCard
                label={vi.serverHealth.redis}
                value={statusLabel(data.redis.status)}
                hint={data.redis.latencyMs != null ? `${data.redis.latencyMs} ms` : undefined}
                tone={data.redis.status === 'ok' ? 'success' : 'danger'}
              />
              <StatCard
                label={vi.serverHealth.workers}
                value={statusLabel(data.workers.status)}
                hint={
                  data.workers.ageMs != null
                    ? `${vi.serverHealth.heartbeatAge}: ${data.workers.ageMs} ms`
                    : vi.serverHealth.noHeartbeat
                }
                tone={
                  data.workers.status === 'ok'
                    ? 'success'
                    : data.workers.status === 'stale'
                      ? 'warning'
                      : 'danger'
                }
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="space-y-3 p-4">
                <h3 className="font-semibold text-slate-900">{vi.serverHealth.processTitle}</h3>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-slate-500">{vi.serverHealth.uptime}</dt>
                    <dd className="font-medium">{formatUptime(data.process.uptimeSec)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">PID</dt>
                    <dd className="font-mono text-xs">{data.process.pid}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">{vi.serverHealth.heap}</dt>
                    <dd>
                      {data.process.heapUsedMb} / {data.process.heapTotalMb} MB
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">RSS</dt>
                    <dd>{data.process.rssMb} MB</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">{vi.serverHealth.eventLoop}</dt>
                    <dd
                      className={cn(
                        data.process.eventLoopLagMs >= 100 ? 'text-amber-700' : undefined,
                      )}
                    >
                      {data.process.eventLoopLagMs} ms
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Node</dt>
                    <dd className="font-mono text-xs">{data.process.nodeVersion}</dd>
                  </div>
                </dl>
              </Card>

              <Card className="space-y-3 p-4">
                <h3 className="font-semibold text-slate-900">{vi.serverHealth.queueTitle}</h3>
                {data.queues ? (
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-slate-500">{vi.serverHealth.waiting}</dt>
                      <dd>{data.queues.waitingJobs}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">{vi.serverHealth.active}</dt>
                      <dd>{data.queues.activeJobs}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">{vi.serverHealth.delayed}</dt>
                      <dd>{data.queues.delayedJobs}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">{vi.serverHealth.failed}</dt>
                      <dd
                        className={cn(
                          data.queues.failedJobs > 0 ? 'font-medium text-red-700' : undefined,
                        )}
                      >
                        {data.queues.failedJobs}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="text-sm text-slate-500">{vi.serverHealth.queueUnavailable}</p>
                )}
                <p className="text-xs text-slate-500">
                  {vi.serverHealth.checkedAt}: {formatDateTime(data.checkedAt)} · build{' '}
                  <span className="font-mono">{data.buildVersion}</span>
                  {data.workers.buildVersion
                    ? ` · worker ${data.workers.buildVersion}`
                    : ''}
                </p>
              </Card>
            </div>

            <Card className="flex flex-wrap gap-4 p-4 text-sm">
              <Link href="/monitoring/queues" className="text-admin-600 hover:underline">
                {vi.serverHealth.linkQueues}
              </Link>
              <Link href="/configuration/health" className="text-admin-600 hover:underline">
                {vi.serverHealth.linkSystemHealth}
              </Link>
              <span className="text-slate-400">
                {vi.serverHealth.publicReady}: /health/ready
              </span>
            </Card>
          </>
        )}
      </div>
    </RequirePermission>
  );
}
