'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { RequirePermission } from '@/components/layout/AdminShell';
import {
  ActivityLogDrawer,
  ActivitySeverityDot,
  ActivityTimelineItem,
} from '@/components/monitoring/ActivityLogPanel';
import {
  MonitoringFilterBar,
  MonitoringSectionHeader,
} from '@/components/monitoring/MonitoringUi';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input } from '@/components/ui/Form';
import { useAuth } from '@/hooks/useAuth';
import { vi } from '@/lib/i18n/vi';
import { cn, formatDateTime } from '@/lib/utils';
import { systemActivityApi, ApiClientError } from '@/services/api-client';
import type { SystemActivityLog, SystemActivityLogStats } from '@/types/api';

const SEVERITIES = ['INFO', 'SUCCESS', 'WARNING', 'ERROR', 'CRITICAL'] as const;
const CATEGORIES = [
  'AUTH', 'SYSTEM', 'EMAIL', 'PROVIDER', 'EXPORT', 'ORDER', 'WEBHOOK',
] as const;
const SOURCES = ['ADMIN', 'SYSTEM', 'WORKER', 'API'] as const;
const PAGE_SIZES = [20, 50, 100] as const;

const SEVERITY_ROW: Record<string, string> = {
  INFO: 'text-blue-700',
  SUCCESS: 'text-green-700',
  WARNING: 'text-yellow-700',
  ERROR: 'text-orange-700',
  CRITICAL: 'text-red-700',
};

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="text-center">
      <p className="text-2xl font-bold text-admin-700">{value.toLocaleString('vi-VN')}</p>
      <p className="mt-1 text-sm text-zinc-500">{label}</p>
    </Card>
  );
}

export default function ActivityLogsPageWrapper() {
  return (
    <Suspense fallback={<p className="text-zinc-500">{vi.app.loading}</p>}>
      <ActivityLogsPage />
    </Suspense>
  );
}

function ActivityLogsPage() {
  const searchParams = useSearchParams();
  const [logs, setLogs] = useState<SystemActivityLog[]>([]);
  const [stats, setStats] = useState<SystemActivityLogStats>({
    today: 0,
    yesterday: 0,
    thisWeek: 0,
    total: 0,
  });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<number>(20);
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [view, setView] = useState<'table' | 'timeline'>('table');
  const [keyword, setKeyword] = useState('');
  const [severity, setSeverity] = useState('');
  const [category, setCategory] = useState('');
  const [source, setSource] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<SystemActivityLog | null>(null);
  const { can } = useAuth();
  const canExport = can('activity.export');

  useEffect(() => {
    const kw = searchParams.get('keyword');
    if (kw) setKeyword(kw);
  }, [searchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await systemActivityApi.list({
        page,
        limit,
        sort,
        keyword: keyword || undefined,
        severity: severity || undefined,
        category: category || undefined,
        source: source || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      setLogs(result.items);
      setStats(result.stats);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.activityLog.loadError);
    } finally {
      setLoading(false);
    }
  }, [page, limit, sort, keyword, severity, category, source, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const filterParams = {
    keyword: keyword || undefined,
    severity: severity || undefined,
    category: category || undefined,
    source: source || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    sort,
  };

  return (
    <RequirePermission permission="activity.read">
      <div className="space-y-6">
        <MonitoringSectionHeader
          title={vi.activityLog.title}
          subtitle={vi.activityLog.subtitle}
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={vi.activityLog.today} value={stats.today} />
          <StatCard label={vi.activityLog.yesterday} value={stats.yesterday} />
          <StatCard label={vi.activityLog.thisWeek} value={stats.thisWeek} />
          <StatCard label={vi.activityLog.total} value={stats.total} />
        </div>

        <MonitoringFilterBar>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Input
              placeholder={vi.activityLog.searchPlaceholder}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <select
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              <option value="">{vi.activityLog.allSeverity}</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">{vi.activityLog.allCategory}</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="">{vi.activityLog.allSource}</option>
              {SOURCES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            <select
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              value={sort}
              onChange={(e) => setSort(e.target.value as 'newest' | 'oldest')}
            >
              <option value="newest">{vi.systemAudit.newest}</option>
              <option value="oldest">{vi.systemAudit.oldest}</option>
            </select>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => { setPage(1); void load(); }} disabled={loading}>
                {vi.app.filter}
              </Button>
              <Button
                variant={view === 'table' ? 'primary' : 'secondary'}
                onClick={() => setView('table')}
              >
                {vi.monitoringHub.tableView}
              </Button>
              <Button
                variant={view === 'timeline' ? 'primary' : 'secondary'}
                onClick={() => setView('timeline')}
              >
                {vi.monitoringHub.timelineView}
              </Button>
              {canExport && (
                <>
                  <Button variant="secondary" onClick={() => void systemActivityApi.exportCsv(filterParams)}>
                    CSV
                  </Button>
                  <Button variant="secondary" onClick={() => void systemActivityApi.exportExcel(filterParams)}>
                    Excel
                  </Button>
                </>
              )}
            </div>
          </div>
        </MonitoringFilterBar>

        {error && <ErrorMessage message={error} />}

        <Card>
          {view === 'timeline' ? (
            <div className="divide-y divide-zinc-100">
              {logs.map((log) => (
                <ActivityTimelineItem
                  key={log.id}
                  log={log}
                  onClick={() => setSelected(log)}
                />
              ))}
              {!loading && logs.length === 0 && (
                <p className="py-8 text-center text-zinc-400">{vi.common.noData}</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-zinc-500">
                    <th className="py-2 pr-4">{vi.audit.time}</th>
                    <th className="py-2 pr-4">{vi.activityLog.severity}</th>
                    <th className="py-2 pr-4">{vi.activityLog.category}</th>
                    <th className="py-2 pr-4">{vi.activityLog.event}</th>
                    <th className="py-2 pr-4">{vi.audit.user}</th>
                    <th className="py-2 pr-4">{vi.activityLog.source}</th>
                    <th className="py-2">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr
                      key={log.id}
                      className="cursor-pointer border-b border-zinc-50 hover:bg-zinc-50"
                      onClick={() => setSelected(log)}
                    >
                      <td className="py-3 pr-4 whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
                      <td className={cn('py-3 pr-4 font-medium', SEVERITY_ROW[log.severity])}>
                        <span className="inline-flex items-center gap-2">
                          <ActivitySeverityDot severity={log.severity} />
                          {log.severity}
                        </span>
                      </td>
                      <td className="py-3 pr-4">{log.eventCategory}</td>
                      <td className="py-3 pr-4 font-mono text-xs">{log.eventType}</td>
                      <td className="py-3 pr-4">{log.performedEmail ?? '—'}</td>
                      <td className="py-3 pr-4">{log.source}</td>
                      <td className="py-3 font-mono text-xs">{log.ipAddress ?? '—'}</td>
                    </tr>
                  ))}
                  {!loading && logs.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-zinc-400">
                        {vi.common.noData}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-4">
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <span>{total.toLocaleString('vi-VN')} {vi.common.results}</span>
              <select
                className="rounded border border-zinc-200 px-2 py-1"
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                {vi.common.prev}
              </Button>
              <span className="text-sm text-zinc-500">{vi.common.page} {page}/{totalPages}</span>
              <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                {vi.common.next}
              </Button>
            </div>
          </div>
        </Card>

        <ActivityLogDrawer log={selected} onClose={() => setSelected(null)} />
      </div>
    </RequirePermission>
  );
}
