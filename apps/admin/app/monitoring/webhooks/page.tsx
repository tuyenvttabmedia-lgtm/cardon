'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { RequirePermission } from '@/components/layout/AdminShell';
import { HealthBadge, JobTimelineView } from '@/components/monitoring/QueueMonitorChart';
import {
  MonitoringActionBar,
  MonitoringSectionHeader,
} from '@/components/monitoring/MonitoringUi';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input } from '@/components/ui/Form';
import { useAuth } from '@/hooks/useAuth';
import { vi } from '@/lib/i18n/vi';
import { cn, formatDateTime } from '@/lib/utils';
import { webhookMonitorApi, ApiClientError } from '@/services/api-client';
import type {
  WebhookMonitorDetail,
  WebhookMonitorHistory,
  WebhookMonitorItem,
  WebhookMonitorListResponse,
  WebhookMonitorStatistics,
  WebhookMonitorStatus,
} from '@/types/api';

const PAGE_SIZES = [20, 50, 100] as const;
const REFRESH_OPTIONS = [
  { label: vi.webhookMonitor.refreshOff, value: 0 },
  { label: '5s', value: 5 },
  { label: '10s', value: 10 },
  { label: '30s', value: 30 },
  { label: '60s', value: 60 },
] as const;
const STATUS_OPTIONS: WebhookMonitorStatus[] = [
  'SUCCESS',
  'FAILED',
  'PENDING',
  'RETRY',
  'TIMEOUT',
  'INVALID_SIGNATURE',
  'DUPLICATE',
  'IGNORED',
];
const SOURCE_OPTIONS = ['MEGAPAY', 'SEPAY', 'PROVIDER', 'PARTNER', 'INTERNAL'] as const;
const HISTORY_RANGES = [
  { id: '24h', label: vi.webhookMonitor.range24h },
  { id: '7d', label: vi.webhookMonitor.range7d },
  { id: '30d', label: vi.webhookMonitor.range30d },
  { id: 'custom', label: vi.webhookMonitor.rangeCustom },
] as const;

type DetailTab = 'summary' | 'headers' | 'payload' | 'response' | 'timeline' | 'retryHistory' | 'metadata';

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

function StatusBadge({ status }: { status: WebhookMonitorStatus }) {
  const cls =
    status === 'SUCCESS'
      ? 'bg-green-100 text-green-800'
      : status === 'FAILED'
        ? 'bg-red-100 text-red-800'
        : status === 'INVALID_SIGNATURE'
          ? 'bg-red-200 text-red-900'
          : status === 'PENDING' || status === 'RETRY'
            ? 'bg-yellow-100 text-yellow-800'
            : status === 'DUPLICATE'
              ? 'bg-purple-100 text-purple-800'
              : 'bg-zinc-100 text-zinc-700';
  return <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', cls)}>{status}</span>;
}

function WebhookHourlyChart({
  buckets,
}: {
  buckets: Array<{ hour: string; success: number; failed: number; retry: number; timeout: number; duplicate: number }>;
}) {
  const max = Math.max(1, ...buckets.map((b) => b.success + b.failed + b.retry + b.timeout + b.duplicate));
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-zinc-700">{vi.webhookMonitor.hourlyChart}</p>
      <div className="flex h-36 items-end gap-0.5 overflow-x-auto rounded-lg border border-zinc-100 bg-zinc-50 p-2">
        {buckets.map((b) => {
          const total = b.success + b.failed + b.retry + b.timeout + b.duplicate;
          return (
            <div key={b.hour} className="flex min-w-[10px] flex-1 flex-col items-center justify-end" title={b.hour}>
              <div className="flex w-full flex-col justify-end" style={{ height: '100%' }}>
                {b.failed > 0 && <div className="w-full bg-red-400" style={{ height: `${Math.round((b.failed / max) * 100)}%`, minHeight: 2 }} />}
                {b.timeout > 0 && <div className="w-full bg-orange-400" style={{ height: `${Math.round((b.timeout / max) * 100)}%`, minHeight: 2 }} />}
                {b.retry > 0 && <div className="w-full bg-yellow-400" style={{ height: `${Math.round((b.retry / max) * 100)}%`, minHeight: 2 }} />}
                {b.duplicate > 0 && <div className="w-full bg-purple-400" style={{ height: `${Math.round((b.duplicate / max) * 100)}%`, minHeight: 2 }} />}
                {b.success > 0 && <div className="w-full bg-green-500" style={{ height: `${Math.round((b.success / max) * 100)}%`, minHeight: 2 }} />}
                {total === 0 && <div className="h-0.5 w-full bg-zinc-200" />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function confirmAction(message: string): boolean {
  return window.confirm(message);
}

function WebhookDetailDrawer({
  id,
  onClose,
  canManage,
  onAction,
}: {
  id: string | null;
  onClose: () => void;
  canManage: boolean;
  onAction: () => void;
}) {
  const [detail, setDetail] = useState<WebhookMonitorDetail | null>(null);
  const [tab, setTab] = useState<DetailTab>('summary');
  const [payloadExpanded, setPayloadExpanded] = useState(false);
  const [payloadSearch, setPayloadSearch] = useState('');

  useEffect(() => {
    if (!id) {
      setDetail(null);
      return;
    }
    void webhookMonitorApi.getById(id).then(setDetail).catch(() => setDetail(null));
  }, [id]);

  if (!id) return null;

  const payloadText = detail ? JSON.stringify(detail.payload, null, 2) : '';
  const showPayload = payloadExpanded || !detail?.payloadCollapsed;
  const filteredPayload =
    payloadSearch.trim() && payloadText
      ? payloadText
          .split('\n')
          .filter((line) => line.toLowerCase().includes(payloadSearch.trim().toLowerCase()))
          .join('\n')
      : payloadText;

  const tabs: { id: DetailTab; label: string }[] = [
    { id: 'summary', label: vi.webhookMonitor.summary },
    { id: 'headers', label: vi.webhookMonitor.headers },
    { id: 'payload', label: vi.webhookMonitor.payload },
    { id: 'response', label: vi.webhookMonitor.response },
    { id: 'timeline', label: vi.webhookMonitor.timeline },
    { id: 'retryHistory', label: vi.webhookMonitor.retryHistory },
    { id: 'metadata', label: vi.webhookMonitor.metadata },
  ];

  return (
    <>
      <button type="button" className="fixed inset-0 z-40 bg-black/30" aria-label={vi.common.close} onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-zinc-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <h3 className="text-lg font-semibold">{vi.webhookMonitor.detail}</h3>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1 text-sm text-zinc-500 hover:bg-zinc-100">
            {vi.common.close}
          </button>
        </div>
        <div className="flex gap-1 overflow-x-auto border-b border-zinc-100 px-5 py-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm',
                tab === t.id ? 'bg-admin-100 font-medium text-admin-800' : 'text-zinc-600 hover:bg-zinc-100',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {!detail ? (
            <p className="text-sm text-zinc-500">{vi.common.noData}</p>
          ) : (
            <>
              {tab === 'summary' && (
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-zinc-500">Webhook ID</dt><dd className="font-mono text-xs">{detail.id}</dd></div>
                  <div><dt className="text-zinc-500">{vi.webhookMonitor.source}</dt><dd>{detail.displayName}</dd></div>
                  <div><dt className="text-zinc-500">{vi.common.created}</dt><dd>{formatDateTime(detail.createdAt)}</dd></div>
                  <div><dt className="text-zinc-500">{vi.webhookMonitor.duration}</dt><dd>{detail.durationMs != null ? `${detail.durationMs} ms` : '—'}</dd></div>
                  <div><dt className="text-zinc-500">{vi.webhookMonitor.retry}</dt><dd>{detail.retry}</dd></div>
                  <div><dt className="text-zinc-500">{vi.webhookMonitor.status}</dt><dd><StatusBadge status={detail.status} /></dd></div>
                  <div className="col-span-2"><dt className="text-zinc-500">{vi.webhookMonitor.correlationId}</dt><dd className="font-mono text-xs">{detail.correlationId ?? '—'}</dd></div>
                  <div><dt className="text-zinc-500">{vi.webhookMonitor.signature}</dt><dd><span className={cn('rounded px-2 py-0.5 text-xs font-semibold', detail.signature.verified ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800')}>{detail.signature.badge}</span></dd></div>
                </dl>
              )}
              {tab === 'headers' && (
                <pre className="overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs">{JSON.stringify(detail.headers, null, 2)}</pre>
              )}
              {tab === 'payload' && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {detail.payloadCollapsed && (
                      <Button type="button" variant="secondary" onClick={() => setPayloadExpanded((e) => !e)}>
                        {payloadExpanded ? vi.webhookMonitor.collapse : vi.webhookMonitor.expand}
                      </Button>
                    )}
                    <Input placeholder={vi.webhookMonitor.searchPayload} value={payloadSearch} onChange={(e) => setPayloadSearch(e.target.value)} className="max-w-xs" />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        void navigator.clipboard.writeText(payloadText);
                        void webhookMonitorApi.logCopy(detail.id, 'copy_payload');
                      }}
                    >
                      {vi.webhookMonitor.copyPayload}
                    </Button>
                  </div>
                  {showPayload ? (
                    <pre className="max-h-96 overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs">{filteredPayload || payloadText}</pre>
                  ) : (
                    <p className="text-sm text-zinc-500">Payload &gt; 100KB — {vi.webhookMonitor.collapse}</p>
                  )}
                </div>
              )}
              {tab === 'response' && (
                <dl className="space-y-2 text-sm">
                  <div><dt className="text-zinc-500">{vi.webhookMonitor.httpCode}</dt><dd>{detail.response.httpCode}</dd></div>
                  <div><dt className="text-zinc-500">{vi.webhookMonitor.duration}</dt><dd>{detail.response.durationMs != null ? `${detail.response.durationMs} ms` : '—'}</dd></div>
                  <div><dt className="text-zinc-500">Worker</dt><dd>{detail.response.worker ?? '—'}</dd></div>
                  <div><dt className="text-zinc-500">Queue</dt><dd>{detail.response.queue ?? '—'}</dd></div>
                  <pre className="overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs">{JSON.stringify(detail.response.body, null, 2)}</pre>
                </dl>
              )}
              {tab === 'timeline' && <JobTimelineView steps={detail.timeline} />}
              {tab === 'retryHistory' && (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-zinc-500"><th>Attempt</th><th>{vi.webhookMonitor.time}</th><th>{vi.webhookMonitor.httpCode}</th><th>{vi.webhookMonitor.duration}</th></tr></thead>
                  <tbody>
                    {detail.retryHistory.length === 0 ? (
                      <tr><td colSpan={4} className="py-4 text-zinc-500">{vi.common.noData}</td></tr>
                    ) : (
                      detail.retryHistory.map((r) => (
                        <tr key={r.webhookId} className="border-b border-zinc-50">
                          <td className="py-2">{r.attempt}</td>
                          <td>{formatDateTime(r.time)}</td>
                          <td>{r.httpCode}</td>
                          <td>{r.durationMs != null ? `${r.durationMs} ms` : '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
              {tab === 'metadata' && (
                <pre className="overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs">{JSON.stringify(detail.metadata, null, 2)}</pre>
              )}
              {canManage && ['FAILED', 'RETRY', 'PENDING', 'TIMEOUT'].includes(detail.status) && !detail.cancelled && (
                <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
                  <Button
                    type="button"
                    onClick={() => {
                      if (!confirmAction(vi.webhookMonitor.confirmAction)) return;
                      void webhookMonitorApi.retry(detail.id).then(onAction);
                    }}
                  >
                    {vi.webhookMonitor.retry}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      if (!confirmAction(vi.webhookMonitor.confirmAction)) return;
                      void webhookMonitorApi.cancel([detail.id]).then(() => { onAction(); onClose(); });
                    }}
                  >
                    {vi.webhookMonitor.cancelPending}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}

export default function WebhookMonitorPageWrapper() {
  return (
    <Suspense fallback={<p className="text-zinc-500">{vi.app.loading}</p>}>
      <WebhookMonitorPage />
    </Suspense>
  );
}

function WebhookMonitorPage() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<WebhookMonitorListResponse | null>(null);
  const [stats, setStats] = useState<WebhookMonitorStatistics | null>(null);
  const [history, setHistory] = useState<WebhookMonitorHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshSec, setRefreshSec] = useState(10);
  const [countdown, setCountdown] = useState(10);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [source, setSource] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [orderId, setOrderId] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [requestId, setRequestId] = useState('');
  const [correlationId, setCorrelationId] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [httpCode, setHttpCode] = useState('');
  const [keyword, setKeyword] = useState('');
  const [historyRange, setHistoryRange] = useState('24h');
  const { can } = useAuth();
  const canManage = can('webhook.manage');
  const canExport = can('webhook.export');

  useEffect(() => {
    const id = searchParams.get('id');
    if (id) setDetailId(id);
    const oid = searchParams.get('order_id');
    if (oid) setOrderId(oid);
    const rid = searchParams.get('request_id');
    if (rid) setRequestId(rid);
    const cid = searchParams.get('correlation_id');
    if (cid) setCorrelationId(cid);
  }, [searchParams]);

  const filters = useMemo(
    () => ({
      page,
      limit,
      source: source || undefined,
      status: status || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      order_id: orderId || undefined,
      payment_id: paymentId || undefined,
      request_id: requestId || undefined,
      correlation_id: correlationId || undefined,
      endpoint: endpoint || undefined,
      http_code: httpCode ? Number(httpCode) : undefined,
      keyword: keyword || undefined,
    }),
    [page, limit, source, status, dateFrom, dateTo, orderId, paymentId, requestId, correlationId, endpoint, httpCode, keyword],
  );

  const exportParams = useMemo(
    () => ({
      source: source || undefined,
      status: status || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      range: historyRange,
    }),
    [source, status, dateFrom, dateTo, historyRange],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, statistics, hist] = await Promise.all([
        webhookMonitorApi.list(filters),
        webhookMonitorApi.statistics(source || undefined),
        webhookMonitorApi.history({ range: historyRange, source: source || undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined }),
      ]);
      setData(list);
      setStats(statistics);
      setHistory(hist);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : vi.webhookMonitor.loadError);
    } finally {
      setLoading(false);
    }
  }, [filters, source, historyRange, dateFrom, dateTo]);

  useEffect(() => { void load(); }, [load]);

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
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / limit));
  const items = data?.items ?? [];

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.id)));
  };

  return (
    <RequirePermission permission="webhook.read">
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <MonitoringSectionHeader
            title={vi.webhookMonitor.title}
            subtitle={vi.webhookMonitor.subtitle}
          />
          <MonitoringActionBar>
            <select className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" value={refreshSec} onChange={(e) => setRefreshSec(Number(e.target.value))}>
              {REFRESH_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label === vi.webhookMonitor.refreshOff ? o.label : `${vi.webhookMonitor.autoRefresh} ${o.label}`}
                </option>
              ))}
            </select>
            {refreshSec > 0 && <span className="text-sm text-zinc-500">{vi.webhookMonitor.countdown} {countdown}s</span>}
            <Button type="button" variant="secondary" disabled={loading} onClick={() => void load()}>↻</Button>
          </MonitoringActionBar>
        </div>

        {error && <ErrorMessage message={error} />}

        {summary && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            <StatCard label={vi.webhookMonitor.totalToday} value={summary.totalToday} />
            <StatCard label={vi.webhookMonitor.success} value={summary.success} tone="ok" />
            <StatCard label={vi.webhookMonitor.failed} value={summary.failed} tone="error" />
            <StatCard label={vi.webhookMonitor.pending} value={summary.pending} tone="warn" />
            <StatCard label={vi.webhookMonitor.duplicate} value={summary.duplicate} />
            <StatCard label={vi.webhookMonitor.invalidSignature} value={summary.invalidSignature} tone="error" />
            <StatCard label={vi.webhookMonitor.retryQueue} value={summary.retryQueue} tone="warn" />
            <StatCard label={vi.webhookMonitor.avgResponse} value={summary.avgResponseTimeMs != null ? `${summary.avgResponseTimeMs} ms` : '—'} />
            <StatCard label={vi.webhookMonitor.last24h} value={summary.last24Hours} />
          </div>
        )}

        {stats && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                <div><p className="text-zinc-500">{vi.webhookMonitor.webhooksPerMinute}</p><p className="text-lg font-semibold">{stats.webhooksPerMinute}</p></div>
                <div><p className="text-zinc-500">{vi.webhookMonitor.webhooksPerHour}</p><p className="text-lg font-semibold">{stats.webhooksPerHour}</p></div>
                <div><p className="text-zinc-500">{vi.webhookMonitor.avgResponse}</p><p className="text-lg font-semibold">{stats.avgDurationMs != null ? `${stats.avgDurationMs} ms` : '—'}</p></div>
                <div><p className="text-zinc-500">{vi.webhookMonitor.retryRate}</p><p className="text-lg font-semibold">{stats.retryRate}%</p></div>
                <div><p className="text-zinc-500">{vi.webhookMonitor.failureRate}</p><p className="text-lg font-semibold">{stats.failureRate}%</p></div>
                <div><p className="text-zinc-500">{vi.webhookMonitor.signatureFailRate}</p><p className="text-lg font-semibold">{stats.signatureFailRate}%</p></div>
              </div>
            </Card>
            <Card><WebhookHourlyChart buckets={stats.hourly} /></Card>
          </div>
        )}

        {data?.sources && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {data.sources.map((s) => (
              <div key={s.source} role="button" tabIndex={0} className="cursor-pointer" onClick={() => { setSource(s.source); setPage(1); }} onKeyDown={(e) => { if (e.key === 'Enter') { setSource(s.source); setPage(1); } }}>
              <Card className="hover:border-admin-300">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-zinc-800">{s.displayName}</h3>
                  <HealthBadge health={s.health} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-600">
                  <div><dt>{vi.webhookMonitor.today}</dt><dd className="font-medium text-zinc-900">{s.today}</dd></div>
                  <div><dt>{vi.webhookMonitor.success}</dt><dd className="font-medium text-green-700">{s.success}</dd></div>
                  <div><dt>{vi.webhookMonitor.failed}</dt><dd className="font-medium text-red-700">{s.failed}</dd></div>
                  <div><dt>{vi.webhookMonitor.retry}</dt><dd className="font-medium">{s.retry}</dd></div>
                  <div className="col-span-2"><dt>{vi.webhookMonitor.lastReceived}</dt><dd>{s.lastReceivedAt ? formatDateTime(s.lastReceivedAt) : '—'}</dd></div>
                </dl>
              </Card>
              </div>
            ))}
          </div>
        )}

        <Card>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            <Input placeholder={vi.webhookMonitor.orderId} value={orderId} onChange={(e) => { setOrderId(e.target.value); setPage(1); }} />
            <Input placeholder={vi.webhookMonitor.paymentId} value={paymentId} onChange={(e) => { setPaymentId(e.target.value); setPage(1); }} />
            <Input placeholder={vi.webhookMonitor.correlationId} value={correlationId} onChange={(e) => { setCorrelationId(e.target.value); setPage(1); }} />
            <Input placeholder={vi.webhookMonitor.requestId} value={requestId} onChange={(e) => { setRequestId(e.target.value); setPage(1); }} />
            <Input placeholder={vi.webhookMonitor.endpoint} value={endpoint} onChange={(e) => { setEndpoint(e.target.value); setPage(1); }} />
            <Input placeholder={vi.webhookMonitor.httpCode} value={httpCode} onChange={(e) => { setHttpCode(e.target.value); setPage(1); }} />
            <select className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }}>
              <option value="">{vi.webhookMonitor.source}</option>
              {SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="rounded-lg border border-zinc-200 px-3 py-2 text-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">{vi.webhookMonitor.status}</option>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
            <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
            <Input placeholder="Search…" value={keyword} onChange={(e) => { setKeyword(e.target.value); setPage(1); }} />
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {canManage && (
              <>
                <Button
                  type="button"
                  disabled={selected.size === 0}
                  onClick={() => {
                    if (!confirmAction(vi.webhookMonitor.confirmAction)) return;
                    void webhookMonitorApi.retryFailed([...selected]).then(() => { setSelected(new Set()); void load(); });
                  }}
                >
                  {vi.webhookMonitor.retrySelected}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    if (!confirmAction(vi.webhookMonitor.confirmAction)) return;
                    void webhookMonitorApi.retryFailed().then(() => void load());
                  }}
                >
                  {vi.webhookMonitor.retryFailed}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={selected.size === 0}
                  onClick={() => {
                    if (!confirmAction(vi.webhookMonitor.confirmAction)) return;
                    void webhookMonitorApi.cancel([...selected]).then(() => { setSelected(new Set()); void load(); });
                  }}
                >
                  {vi.webhookMonitor.cancelPending}
                </Button>
              </>
            )}
            {canExport && (
              <>
                <Button type="button" variant="secondary" onClick={() => void webhookMonitorApi.exportCsv(exportParams)}>{vi.webhookMonitor.exportCsv}</Button>
                <Button type="button" variant="secondary" onClick={() => void webhookMonitorApi.exportExcel(exportParams)}>{vi.webhookMonitor.exportExcel}</Button>
                <Button type="button" variant="secondary" onClick={() => void webhookMonitorApi.exportJson(exportParams)}>{vi.webhookMonitor.exportJson}</Button>
              </>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-sm">
              <thead>
                <tr className="border-b text-left text-zinc-500">
                  {canManage && (
                    <th className="py-2 pr-2">
                      <input type="checkbox" checked={items.length > 0 && selected.size === items.length} onChange={toggleSelectAll} />
                    </th>
                  )}
                  <th className="py-2 pr-3">{vi.webhookMonitor.time}</th>
                  <th className="py-2 pr-3">{vi.webhookMonitor.source}</th>
                  <th className="py-2 pr-3">{vi.webhookMonitor.endpoint}</th>
                  <th className="py-2 pr-3">{vi.webhookMonitor.method}</th>
                  <th className="py-2 pr-3">{vi.webhookMonitor.status}</th>
                  <th className="py-2 pr-3">{vi.webhookMonitor.httpCode}</th>
                  <th className="py-2 pr-3">{vi.webhookMonitor.duration}</th>
                  <th className="py-2 pr-3">{vi.webhookMonitor.signature}</th>
                  <th className="py-2 pr-3">{vi.webhookMonitor.retry}</th>
                  <th className="py-2 pr-3">{vi.webhookMonitor.correlationId}</th>
                  <th className="py-2 pr-3">{vi.webhookMonitor.orderId}</th>
                  <th className="py-2 pr-3">{vi.webhookMonitor.paymentId}</th>
                  <th className="py-2 pr-3">{vi.webhookMonitor.provider}</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={canManage ? 15 : 14} className="py-8 text-center text-zinc-500">{vi.common.noData}</td></tr>
                ) : (
                  items.map((row: WebhookMonitorItem) => (
                    <tr key={row.id} className="cursor-pointer border-b border-zinc-50 hover:bg-zinc-50" onClick={() => setDetailId(row.id)}>
                      {canManage && (
                        <td className="py-2 pr-2" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)} />
                        </td>
                      )}
                      <td className="py-2 pr-3 whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
                      <td className="py-2 pr-3">{row.displayName}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{row.endpoint}</td>
                      <td className="py-2 pr-3">{row.method}</td>
                      <td className="py-2 pr-3"><StatusBadge status={row.status} /></td>
                      <td className="py-2 pr-3">{row.httpCode}</td>
                      <td className="py-2 pr-3">{row.durationMs != null ? `${row.durationMs} ms` : '—'}</td>
                      <td className="py-2 pr-3">{row.signatureValid ? vi.webhookMonitor.verified : vi.webhookMonitor.invalid}</td>
                      <td className="py-2 pr-3">{row.retry}</td>
                      <td className="py-2 pr-3 font-mono text-xs max-w-[120px] truncate">{row.correlationId ?? '—'}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{row.orderId ?? '—'}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{row.paymentId ?? '—'}</td>
                      <td className="py-2 pr-3">{row.provider}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-zinc-500">
              {data?.total ?? 0} {vi.common.results} · {vi.common.page} {page}/{totalPages}
            </span>
            <div className="flex items-center gap-2">
              <select className="rounded-lg border border-zinc-200 px-2 py-1 text-sm" value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}>
                {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <Button type="button" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{vi.common.prev}</Button>
              <Button type="button" variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>{vi.common.next}</Button>
            </div>
          </div>
        </Card>

        {history && history.buckets.length > 0 && (
          <Card>
            <div className="mb-3 flex gap-2">
              {HISTORY_RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setHistoryRange(r.id)}
                  className={cn('rounded-lg px-3 py-1 text-sm', historyRange === r.id ? 'bg-admin-100 font-medium' : 'text-zinc-600 hover:bg-zinc-100')}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <WebhookHourlyChart
              buckets={history.buckets.map((b) => ({
                hour: b.label,
                success: b.success,
                failed: b.failed,
                retry: b.retry,
                timeout: b.timeout,
                duplicate: b.duplicate,
              }))}
            />
          </Card>
        )}
      </div>

      <WebhookDetailDrawer
        id={detailId}
        onClose={() => setDetailId(null)}
        canManage={canManage}
        onAction={() => void load()}
      />
    </RequirePermission>
  );
}
