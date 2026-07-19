'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { RequirePermission } from '@/components/layout/AdminShell';
import {
  ConfigReadonlyPanel,
  HealthBadge,
  JobTimelineView,
  QueueMonitorChart,
} from '@/components/monitoring/QueueMonitorChart';
import {
  MonitoringActionBar,
  MonitoringSectionHeader,
} from '@/components/monitoring/MonitoringUi';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input } from '@/components/ui/Form';
import { useAuth } from '@/hooks/useAuth';
import { vi } from '@/lib/i18n/vi';
import { cn, formatDateTime } from '@/lib/utils';
import { queueMonitorApi, ApiClientError } from '@/services/api-client';
import type {
  QueueMonitorConfig,
  QueueMonitorDashboard,
  QueueMonitorHistory,
  QueueMonitorJob,
  QueueMonitorJobDetail,
  QueueMonitorQueueRow,
  QueueMonitorStatistics,
  QueueMonitorWorkerInfo,
} from '@/types/api';

const PAGE_SIZES = [20, 50, 100] as const;
const JOB_STATUSES = ['waiting', 'active', 'delayed', 'completed', 'failed', 'paused'] as const;
const REFRESH_OPTIONS = [
  { label: vi.queueMonitor.refreshOff, value: 0 },
  { label: '5s', value: 5 },
  { label: '10s', value: 10 },
  { label: '30s', value: 30 },
  { label: '60s', value: 60 },
] as const;
const HISTORY_RANGES = [
  { id: '24h', label: vi.queueMonitor.range24h },
  { id: '7d', label: vi.queueMonitor.range7d },
  { id: '30d', label: vi.queueMonitor.range30d },
  { id: 'custom', label: vi.queueMonitor.rangeCustom },
] as const;

type QueueTab = 'jobs' | 'statistics' | 'history' | 'failed' | 'delayed' | 'completed' | 'worker' | 'config';

function StatCard({ label, value, tone }: { label: string; value: string | number; tone?: 'ok' | 'warn' | 'error' }) {
  const toneClass =
    tone === 'ok' ? 'text-green-700' : tone === 'warn' ? 'text-yellow-700' : tone === 'error' ? 'text-red-700' : 'text-admin-700';
  return (
    <Card className="text-center">
      <p className={cn('text-2xl font-bold', toneClass)}>
        {typeof value === 'number' ? value.toLocaleString('vi-VN') : value}
      </p>
      <p className="mt-1 text-sm text-zinc-500">{label}</p>
    </Card>
  );
}

function confirmAction(message: string): boolean {
  return window.confirm(message);
}

function JobDetailDrawer({
  job,
  onClose,
  canManage,
  onAction,
}: {
  job: QueueMonitorJobDetail | null;
  onClose: () => void;
  canManage: boolean;
  onAction: () => void;
}) {
  if (!job) return null;
  return (
    <>
      <button type="button" className="fixed inset-0 z-40 bg-black/30" aria-label={vi.common.close} onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-zinc-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <h3 className="text-lg font-semibold">{vi.queueMonitor.jobDetail}</h3>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1 text-sm text-zinc-500 hover:bg-zinc-100">{vi.common.close}</button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <JobTimelineView steps={job.timeline} />
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-zinc-500">Job ID</dt><dd className="font-mono text-xs">{job.id}</dd></div>
            <div><dt className="text-zinc-500">Attempts</dt><dd>{job.attempts}{job.maxAttempts != null ? ` / ${job.maxAttempts}` : ''}</dd></div>
            {job.orderId && <div><dt className="text-zinc-500">Order ID</dt><dd className="font-mono text-xs">{job.orderId}</dd></div>}
            {job.paymentId && <div><dt className="text-zinc-500">Payment ID</dt><dd className="font-mono text-xs">{job.paymentId}</dd></div>}
          </dl>
          <div>
            <h4 className="mb-2 text-sm font-semibold text-zinc-700">{vi.queueMonitor.payload}</h4>
            <pre className="max-h-40 overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs">{JSON.stringify(job.payload, null, 2)}</pre>
          </div>
          {job.error && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-red-700">{vi.queueMonitor.error}</h4>
              <pre className="overflow-auto rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-900">{job.error}</pre>
            </div>
          )}
          {canManage && (
            <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
              {job.status === 'failed' && (
                <Button type="button" onClick={() => { if (confirmAction(vi.queueMonitor.confirmAction)) void queueMonitorApi.retryJob(job.queue, job.id).then(onAction); }}>{vi.queueMonitor.retry}</Button>
              )}
              {job.status === 'delayed' && (
                <Button type="button" onClick={() => { if (confirmAction(vi.queueMonitor.confirmAction)) void queueMonitorApi.promoteJob(job.queue, job.id).then(onAction); }}>{vi.queueMonitor.promote}</Button>
              )}
              <Button type="button" variant="secondary" onClick={() => { if (confirmAction(vi.queueMonitor.confirmAction)) void queueMonitorApi.removeJob(job.queue, job.id).then(() => { onAction(); onClose(); }); }}>{vi.queueMonitor.remove}</Button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function QueueDetailDrawer({
  queue,
  onClose,
  canManage,
  canExport,
  onRefreshDashboard,
}: {
  queue: QueueMonitorQueueRow | null;
  onClose: () => void;
  canManage: boolean;
  canExport: boolean;
  onRefreshDashboard: () => void;
}) {
  const [tab, setTab] = useState<QueueTab>('jobs');
  const [jobs, setJobs] = useState<QueueMonitorJob[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [jobsTotal, setJobsTotal] = useState(0);
  const [jobsPage, setJobsPage] = useState(1);
  const [jobsLimit, setJobsLimit] = useState(20);
  const [jobStatus, setJobStatus] = useState<string>('waiting');
  const [keyword, setKeyword] = useState('');
  const [jobId, setJobId] = useState('');
  const [correlationId, setCorrelationId] = useState('');
  const [requestId, setRequestId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [stats, setStats] = useState<QueueMonitorStatistics | null>(null);
  const [history, setHistory] = useState<QueueMonitorHistory | null>(null);
  const [workers, setWorkers] = useState<QueueMonitorWorkerInfo | null>(null);
  const [config, setConfig] = useState<QueueMonitorConfig | null>(null);
  const [historyRange, setHistoryRange] = useState('24h');
  const [selectedJob, setSelectedJob] = useState<QueueMonitorJobDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const jid = searchParams.get('job_id');
    if (jid) setJobId(jid);
  }, [searchParams]);

  const tabStatus = useMemo((): string => {
    if (tab === 'failed') return 'failed';
    if (tab === 'delayed') return 'delayed';
    if (tab === 'completed') return 'completed';
    return jobStatus;
  }, [tab, jobStatus]);

  const loadJobs = useCallback(async () => {
    if (!queue) return;
    setLoading(true);
    setError(null);
    try {
      const result = await queueMonitorApi.listJobs(queue.name, {
        page: jobsPage,
        limit: jobsLimit,
        status: tabStatus,
        job_id: jobId || undefined,
        correlation_id: correlationId || undefined,
        request_id: requestId || undefined,
        order_id: orderId || undefined,
        payment_id: paymentId || undefined,
        customer_email: customerEmail || undefined,
        keyword: keyword || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      setJobs(result.items);
      setJobsTotal(result.total);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : vi.queueMonitor.loadError);
    } finally {
      setLoading(false);
    }
  }, [queue, jobsPage, jobsLimit, tabStatus, jobId, correlationId, requestId, orderId, paymentId, customerEmail, keyword, dateFrom, dateTo]);

  useEffect(() => {
    if (!queue) return;
    if (tab === 'statistics') void queueMonitorApi.statistics(queue.name).then(setStats).catch(() => setStats(null));
    else if (tab === 'history') void queueMonitorApi.history(queue.name, { range: historyRange, date_from: dateFrom || undefined, date_to: dateTo || undefined }).then(setHistory).catch(() => setHistory(null));
    else if (tab === 'worker') void queueMonitorApi.workers(queue.name).then(setWorkers).catch(() => setWorkers(null));
    else if (tab === 'config') void queueMonitorApi.config(queue.name).then(setConfig).catch(() => setConfig(null));
    else void loadJobs();
  }, [queue, tab, loadJobs, historyRange, dateFrom, dateTo]);

  if (!queue) return null;

  const tabs: { id: QueueTab; label: string }[] = [
    { id: 'jobs', label: vi.queueMonitor.jobs },
    { id: 'statistics', label: vi.queueMonitor.statistics },
    { id: 'history', label: vi.queueMonitor.history },
    { id: 'failed', label: vi.queueMonitor.failed },
    { id: 'delayed', label: vi.queueMonitor.delayed },
    { id: 'completed', label: vi.queueMonitor.completed },
    { id: 'worker', label: vi.queueMonitor.worker },
    { id: 'config', label: vi.queueMonitor.config },
  ];

  const totalPages = Math.max(1, Math.ceil(jobsTotal / jobsLimit));

  async function runManage(action: () => Promise<unknown>) {
    if (!confirmAction(vi.queueMonitor.confirmAction)) return;
    await action();
    onRefreshDashboard();
    if (tab === 'statistics') setStats(await queueMonitorApi.statistics(queue!.name));
    else await loadJobs();
  }

  async function bulkAction(action: 'retry' | 'remove' | 'promote') {
    if (selected.size === 0 || !queue) return;
    if (!confirmAction(vi.queueMonitor.confirmAction)) return;
    await queueMonitorApi.bulkJobs(queue.name, { action, job_ids: [...selected] });
    onRefreshDashboard();
    await loadJobs();
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <button type="button" className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-5xl flex-col border-l border-zinc-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <HealthBadge health={queue.health} />
            <div>
              <h3 className="text-lg font-semibold">{queue.displayName}</h3>
              <p className="text-xs font-mono text-zinc-500">{queue.name}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1 text-sm text-zinc-500 hover:bg-zinc-100">{vi.common.close}</button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-zinc-100 px-5 py-3">
          {tabs.map((t) => (
            <button key={t.id} type="button" className={cn('rounded-lg px-3 py-1.5 text-sm', tab === t.id ? 'bg-admin-100 font-medium' : 'text-zinc-600')} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>

        {(canManage || canExport) && (
          <div className="flex flex-wrap gap-2 border-b border-zinc-100 px-5 py-3">
            {canManage && (
              <>
                {queue.status === 'running' ? (
                  <Button type="button" variant="secondary" onClick={() => void runManage(() => queueMonitorApi.pause(queue.name))}>{vi.queueMonitor.pause}</Button>
                ) : (
                  <Button type="button" onClick={() => void runManage(() => queueMonitorApi.resume(queue.name))}>{vi.queueMonitor.resume}</Button>
                )}
                <Button type="button" variant="secondary" onClick={() => void runManage(() => queueMonitorApi.clean(queue.name, { status: 'completed' }))}>{vi.queueMonitor.clean}</Button>
                <Button type="button" variant="secondary" onClick={() => void runManage(() => queueMonitorApi.retryFailed(queue.name))}>{vi.queueMonitor.retryAllFailed}</Button>
                <Button type="button" variant="secondary" onClick={() => void runManage(() => queueMonitorApi.removeAllCompleted(queue.name))}>{vi.queueMonitor.removeAllCompleted}</Button>
                {selected.size > 0 && (
                  <>
                    <Button type="button" onClick={() => void bulkAction('retry')}>{vi.queueMonitor.retrySelected} ({selected.size})</Button>
                    <Button type="button" variant="secondary" onClick={() => void bulkAction('remove')}>{vi.queueMonitor.removeSelected}</Button>
                    <Button type="button" variant="secondary" onClick={() => void bulkAction('promote')}>{vi.queueMonitor.promoteSelected}</Button>
                  </>
                )}
              </>
            )}
            {canExport && (
              <>
                <Button type="button" variant="secondary" onClick={() => void queueMonitorApi.exportCsv(queue.name, { type: tab === 'statistics' ? 'statistics' : tab === 'history' ? 'history' : tab === 'failed' ? 'failed' : 'jobs', range: historyRange })}>{vi.app.exportCsv}</Button>
                <Button type="button" variant="secondary" onClick={() => void queueMonitorApi.exportExcel(queue.name, { type: tab === 'statistics' ? 'statistics' : 'jobs' })}>Excel</Button>
                <Button type="button" variant="secondary" onClick={() => void queueMonitorApi.exportJson(queue.name, { type: 'jobs' })}>{vi.queueMonitor.exportJson}</Button>
              </>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5">
          {error && <ErrorMessage message={error} />}

          {tab === 'statistics' && stats && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label={vi.queueMonitor.completed} value={stats.counts.completed ?? 0} />
                <StatCard label="Waiting" value={stats.counts.waiting ?? 0} />
                <StatCard label="Active" value={stats.counts.active ?? 0} />
                <StatCard label={vi.queueMonitor.delayed} value={stats.counts.delayed ?? 0} />
                <StatCard label={vi.queueMonitor.failed} value={stats.counts.failed ?? 0} tone="error" />
                <StatCard label="Retries" value={stats.retries} />
                <StatCard label={vi.queueMonitor.jobsPerMinute} value={stats.jobsPerMinute} />
                <StatCard label={vi.queueMonitor.jobsPerHour} value={stats.jobsPerHour} />
                <StatCard label={vi.queueMonitor.avgTime} value={stats.avgProcessingTimeMs != null ? `${stats.avgProcessingTimeMs} ms` : '—'} />
                <StatCard label="P95 Duration" value={stats.p95ProcessingTimeMs != null ? `${stats.p95ProcessingTimeMs} ms` : '—'} />
                <StatCard label={vi.queueMonitor.successRate} value={`${stats.successRate}%`} tone="ok" />
                <StatCard label={vi.queueMonitor.retryRate} value={`${stats.retryRate}%`} />
              </div>
              {stats.longestJob && <p className="text-sm text-zinc-600">Longest job: <span className="font-mono">{stats.longestJob.id}</span> ({stats.longestJob.ms} ms)</p>}
              {stats.oldestWaiting && <p className="text-sm text-zinc-600">Oldest waiting: <span className="font-mono">{stats.oldestWaiting.id}</span></p>}
              <QueueMonitorChart title={vi.queueMonitor.hourlyChart} buckets={stats.hourly.map((h) => ({ label: h.hour, completed: h.completed, failed: h.failed, retry: h.retry }))} />
            </div>
          )}

          {tab === 'history' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {HISTORY_RANGES.map((r) => (
                  <button key={r.id} type="button" className={cn('rounded-lg px-3 py-1.5 text-sm', historyRange === r.id ? 'bg-admin-100 font-medium' : 'text-zinc-600')} onClick={() => setHistoryRange(r.id)}>{r.label}</button>
                ))}
                {historyRange === 'custom' && (
                  <>
                    <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                    <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                  </>
                )}
              </div>
              {history && <QueueMonitorChart title={vi.queueMonitor.history} buckets={history.buckets} />}
            </div>
          )}

          {tab === 'worker' && workers && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-600">Global heartbeat: {workers.globalHeartbeat.at ? formatDateTime(workers.globalHeartbeat.at) : '—'} ({workers.globalHeartbeat.ageMs ?? '—'} ms ago)</p>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-zinc-500">
                    <th className="py-2">Name</th><th>Status</th><th>Hostname</th><th>Started</th><th>Uptime</th><th>Last HB</th>
                  </tr>
                </thead>
                <tbody>
                  {workers.workers.map((w) => (
                    <tr key={w.name} className="border-b border-zinc-50">
                      <td className="py-2 font-mono text-xs">{w.name}</td>
                      <td>{w.status}</td>
                      <td>{w.hostname ?? '—'}</td>
                      <td>{w.startedAt ? formatDateTime(w.startedAt) : '—'}</td>
                      <td>{w.uptimeMs != null ? `${Math.round(w.uptimeMs / 1000)}s` : '—'}</td>
                      <td>{w.lastHeartbeatAgeMs != null ? `${w.lastHeartbeatAgeMs} ms` : '—'}</td>
                    </tr>
                  ))}
                  {workers.workers.length === 0 && (
                    <tr><td colSpan={6} className="py-4 text-center text-zinc-500">{vi.common.noData}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'config' && config && <ConfigReadonlyPanel config={config as unknown as Record<string, unknown>} />}

          {!['statistics', 'history', 'worker', 'config'].includes(tab) && (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
                {tab === 'jobs' && (
                  <select className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" value={jobStatus} onChange={(e) => setJobStatus(e.target.value)}>
                    {JOB_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
                <Input placeholder="Job ID" value={jobId} onChange={(e) => setJobId(e.target.value)} />
                <Input placeholder="Order ID" value={orderId} onChange={(e) => setOrderId(e.target.value)} />
                <Input placeholder="Payment ID" value={paymentId} onChange={(e) => setPaymentId(e.target.value)} />
                <Input placeholder="Correlation ID" value={correlationId} onChange={(e) => setCorrelationId(e.target.value)} />
                <Input placeholder="Request ID" value={requestId} onChange={(e) => setRequestId(e.target.value)} />
                <Input placeholder="Customer Email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
                <Input placeholder="Keyword" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
                <Button type="button" onClick={() => void loadJobs()} disabled={loading}>{vi.app.refresh}</Button>
              </div>
              <Card className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100 text-left text-zinc-500">
                      {canManage && <th className="px-3 py-2"><input type="checkbox" checked={selected.size === jobs.length && jobs.length > 0} onChange={() => setSelected(selected.size === jobs.length ? new Set() : new Set(jobs.map((j) => j.id)))} /></th>}
                      <th className="px-3 py-2">Job ID</th><th>Name</th><th>Status</th><th>Attempts</th><th>Created</th><th>{vi.app.actions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((row) => (
                      <tr key={row.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                        {canManage && <td className="px-3 py-2"><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)} /></td>}
                        <td className="px-3 py-2 font-mono text-xs">{row.id}</td>
                        <td className="px-3 py-2">{row.name}</td>
                        <td className="px-3 py-2">{row.status}</td>
                        <td className="px-3 py-2">{row.attempts}</td>
                        <td className="px-3 py-2">{row.createdAt ? formatDateTime(row.createdAt) : '—'}</td>
                        <td className="px-3 py-2"><button type="button" className="text-admin-600 hover:underline" onClick={() => void queueMonitorApi.getJob(queue.name, row.id).then(setSelectedJob)}>{vi.common.detail}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-500">{jobsPage} / {totalPages}</span>
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" disabled={jobsPage <= 1} onClick={() => setJobsPage((p) => p - 1)}>←</Button>
                  <Button type="button" variant="secondary" disabled={jobsPage >= totalPages} onClick={() => setJobsPage((p) => p + 1)}>→</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
      <JobDetailDrawer job={selectedJob} onClose={() => setSelectedJob(null)} canManage={canManage} onAction={() => { void loadJobs(); onRefreshDashboard(); }} />
    </>
  );
}

export default function QueueMonitorPageWrapper() {
  return (
    <Suspense fallback={<p className="text-zinc-500">{vi.app.loading}</p>}>
      <QueueMonitorPage />
    </Suspense>
  );
}

function QueueMonitorPage() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<QueueMonitorDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshSec, setRefreshSec] = useState(10);
  const [countdown, setCountdown] = useState(10);
  const [selectedQueue, setSelectedQueue] = useState<QueueMonitorQueueRow | null>(null);
  const { can } = useAuth();
  const canManage = can('queue.manage');
  const canExport = can('queue.export');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await queueMonitorApi.list());
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : vi.queueMonitor.loadError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const jid = searchParams.get('job_id');
    if (jid && data?.queues[0] && !selectedQueue) {
      setSelectedQueue(data.queues[0]);
    }
  }, [searchParams, data, selectedQueue]);

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

  const summary = data?.summary;
  const tp = summary?.throughput;

  return (
    <RequirePermission permission="queue.read">
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <MonitoringSectionHeader
              title={vi.queueMonitor.title}
              subtitle={vi.queueMonitor.subtitle}
            />
            {(summary?.criticalQueues ?? 0) > 0 && (
              <span className="mt-2 inline-block rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                {summary!.criticalQueues} {vi.queueMonitor.critical}
              </span>
            )}
          </div>
          <MonitoringActionBar>
            <select className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" value={refreshSec} onChange={(e) => setRefreshSec(Number(e.target.value))}>
              {REFRESH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label === vi.queueMonitor.refreshOff ? o.label : `${vi.queueMonitor.autoRefresh} ${o.label}`}</option>)}
            </select>
            {refreshSec > 0 && <span className="text-sm text-zinc-500">{vi.queueMonitor.countdown} {countdown}s</span>}
            <Button type="button" onClick={() => void load()} disabled={loading}>{vi.app.refresh}</Button>
          </MonitoringActionBar>
        </div>

        {tp && (
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">{vi.queueMonitor.throughput}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              <StatCard label={vi.queueMonitor.jobsPerSec} value={tp.jobsPerSec} />
              <StatCard label={vi.queueMonitor.jobsPerMinute} value={tp.jobsPerMinute} />
              <StatCard label={vi.queueMonitor.jobsPerHour} value={tp.jobsPerHour} />
              <StatCard label={vi.queueMonitor.avgTime} value={tp.avgProcessingTimeMs != null ? `${tp.avgProcessingTimeMs} ms` : '—'} />
              <StatCard label="Avg Waiting" value={tp.avgWaitingTimeMs != null ? `${tp.avgWaitingTimeMs} ms` : '—'} />
              <StatCard label={vi.queueMonitor.retryRate} value={`${tp.retryRate}%`} />
              <StatCard label={vi.queueMonitor.failureRate} value={`${tp.failureRate}%`} tone={tp.failureRate > 0 ? 'error' : undefined} />
            </div>
          </div>
        )}

        {summary && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label={vi.queueMonitor.totalQueues} value={summary.totalQueues} />
            <StatCard label={vi.queueMonitor.activeJobs} value={summary.activeJobs} />
            <StatCard label={vi.queueMonitor.waitingJobs} value={summary.waitingJobs} />
            <StatCard label={vi.queueMonitor.failedJobs} value={summary.failedJobs} tone={summary.failedJobs > 0 ? 'error' : undefined} />
            <StatCard label={vi.queueMonitor.pausedQueues} value={summary.pausedQueues} tone={summary.pausedQueues > 0 ? 'warn' : undefined} />
          </div>
        )}

        {error && <ErrorMessage message={error} />}

        <Card className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-zinc-500">
                <th className="px-3 py-2">{vi.queueMonitor.queueName}</th>
                <th className="px-3 py-2">{vi.queueMonitor.health}</th>
                <th className="px-3 py-2">{vi.queueMonitor.workers}</th>
                <th className="px-3 py-2">{vi.queueMonitor.redisStatus}</th>
                <th className="px-3 py-2">Jobs (W/A/D/F)</th>
                <th className="px-3 py-2">{vi.app.actions}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.queues ?? []).map((row) => (
                <tr key={row.name} className="border-b border-zinc-50 hover:bg-zinc-50">
                  <td className="px-3 py-2">
                    <p className="font-medium">{row.displayName}</p>
                    <p className="text-xs font-mono text-zinc-400">{row.name}</p>
                  </td>
                  <td className="px-3 py-2"><HealthBadge health={row.health} /></td>
                  <td className="px-3 py-2">{row.workerOnline ? `${row.workerCount} online` : 'offline'}</td>
                  <td className="px-3 py-2"><span className={row.redisStatus === 'ok' ? 'text-green-700' : 'text-red-700'}>{row.redisStatus === 'ok' ? 'OK' : row.redisStatus}</span></td>
                  <td className="px-3 py-2">{row.waiting}/{row.active}/{row.delayed}/{row.failed}</td>
                  <td className="px-3 py-2">
                    <button type="button" className="text-admin-600 hover:underline" onClick={() => setSelectedQueue(row)}>{vi.common.detail}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <QueueDetailDrawer queue={selectedQueue} onClose={() => setSelectedQueue(null)} canManage={canManage} canExport={canExport} onRefreshDashboard={() => void load()} />
    </RequirePermission>
  );
}
