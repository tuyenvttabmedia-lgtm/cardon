'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { RequirePermission } from '@/components/layout/AdminShell';
import {
  MonitoringFilterBar,
  MonitoringQuickFilters,
  MonitoringSectionHeader,
} from '@/components/monitoring/MonitoringUi';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input } from '@/components/ui/Form';
import { useAuth } from '@/hooks/useAuth';
import { vi } from '@/lib/i18n/vi';
import { cn, formatDateTime } from '@/lib/utils';
import { systemNotificationApi, ApiClientError } from '@/services/api-client';
import type { SystemNotification, SystemNotificationStats } from '@/types/api';

const SEVERITIES = ['INFO', 'SUCCESS', 'WARNING', 'ERROR', 'CRITICAL'] as const;
const TYPES = [
  'SYSTEM', 'SECURITY', 'PAYMENT', 'PROVIDER', 'QUEUE', 'WEBHOOK',
  'EMAIL', 'MARKETING', 'FINANCE', 'ORDER',
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

const SEVERITY_DOT: Record<string, string> = {
  INFO: 'bg-blue-500',
  SUCCESS: 'bg-green-500',
  WARNING: 'bg-yellow-500',
  ERROR: 'bg-orange-500',
  CRITICAL: 'bg-red-600',
};

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="text-center">
      <p className="text-2xl font-bold text-admin-700">{value.toLocaleString('vi-VN')}</p>
      <p className="mt-1 text-sm text-zinc-500">{label}</p>
    </Card>
  );
}

function NotificationCard({ item }: { item: SystemNotification }) {
  return (
    <div className="relative pl-6">
      <span
        className={cn(
          'absolute left-0 top-2 h-3 w-3 rounded-full',
          SEVERITY_DOT[item.severity] ?? 'bg-zinc-400',
        )}
      />
      <div className="rounded-lg border border-zinc-100 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className={cn('font-medium', item.isRead ? 'text-zinc-600' : 'text-zinc-900')}>
              {item.title}
            </p>
            <p className="mt-1 text-sm text-zinc-600">{item.message}</p>
          </div>
          <span className={cn('text-xs font-medium uppercase', SEVERITY_ROW[item.severity])}>
            {item.severity}
          </span>
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          {formatDateTime(item.createdAt)} · {item.source} · {item.notificationType}
          {item.resourceDisplay ? ` · ${item.resourceDisplay}` : ''}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {!item.isRead && (
            <Button
              type="button"
              className="text-xs"
              onClick={() => void systemNotificationApi.markRead(item.id).then(() => window.location.reload())}
            >
              {vi.notificationCenter.markRead}
            </Button>
          )}
          {item.resourceHref && (
            <Link href={item.resourceHref} className="text-xs text-admin-600 hover:underline self-center">
              {vi.notificationCenter.openResource}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NotificationsPageWrapper() {
  return (
    <Suspense fallback={<p className="text-zinc-500">{vi.app.loading}</p>}>
      <NotificationsPage />
    </Suspense>
  );
}

function NotificationsPage() {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<SystemNotification[]>([]);
  const [stats, setStats] = useState<SystemNotificationStats>({
    unread: 0,
    today: 0,
    critical: 0,
    resolved: 0,
  });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<number>(20);
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [view, setView] = useState<'table' | 'timeline'>('table');
  const [keyword, setKeyword] = useState('');
  const [severity, setSeverity] = useState('');
  const [type, setType] = useState('');
  const [source, setSource] = useState('');
  const [readFilter, setReadFilter] = useState<'all' | 'read' | 'unread'>('all');
  const [monitorPreset, setMonitorPreset] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { can } = useAuth();
  const canManage = can('notification.manage');

  useEffect(() => {
    const kw = searchParams.get('keyword');
    if (kw) setKeyword(kw);
    const id = searchParams.get('id');
    if (id) setKeyword(id);
  }, [searchParams]);

  function applyMonitorPreset(id: string) {
    setMonitorPreset(id);
    setPage(1);
    if (id === 'all') {
      setReadFilter('all');
      setSeverity('');
      setDateFrom('');
      setDateTo('');
      return;
    }
    if (id === 'unread') {
      setReadFilter('unread');
      setSeverity('');
      return;
    }
    if (id === 'critical') {
      setReadFilter('all');
      setSeverity('CRITICAL');
      return;
    }
    if (id === 'today') {
      const today = new Date().toISOString().slice(0, 10);
      setDateFrom(today);
      setDateTo(today);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await systemNotificationApi.list({
        page,
        limit,
        sort,
        keyword: keyword || undefined,
        severity: severity || undefined,
        type: type || undefined,
        source: source || undefined,
        is_read: readFilter === 'all' ? undefined : readFilter === 'read',
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      setItems(result.items);
      setTotal(result.total);
      setStats(result.stats);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : vi.notificationCenter.loadError);
    } finally {
      setLoading(false);
    }
  }, [page, limit, sort, keyword, severity, type, source, readFilter, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.id)));
  }

  async function bulkMarkRead() {
    const ids = [...selected];
    await Promise.all(ids.map((id) => systemNotificationApi.markRead(id)));
    await load();
  }

  async function bulkDismiss() {
    await systemNotificationApi.dismiss([...selected]);
    await load();
  }

  async function markAllRead() {
    await systemNotificationApi.markAllRead();
    await load();
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <RequirePermission permission="notification.read">
      <div className="space-y-6">
        <MonitoringSectionHeader
          title={vi.notificationCenter.title}
          subtitle={vi.notificationCenter.subtitle}
        />

        <MonitoringQuickFilters
          active={monitorPreset}
          onSelect={applyMonitorPreset}
          items={[
            { id: 'all', label: vi.monitoringHub.filterAll },
            { id: 'unread', label: vi.monitoringHub.filterUnread },
            { id: 'critical', label: vi.monitoringHub.filterCritical },
            { id: 'today', label: vi.monitoringHub.filterToday },
          ]}
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={vi.notificationCenter.unread} value={stats.unread} />
          <StatCard label={vi.notificationCenter.today} value={stats.today} />
          <StatCard label={vi.notificationCenter.critical} value={stats.critical} />
          <StatCard label={vi.notificationCenter.resolved} value={stats.resolved} />
        </div>

        <MonitoringFilterBar>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Input
              placeholder={vi.notificationCenter.searchPlaceholder}
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value);
                setPage(1);
              }}
            />
            <select
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              value={severity}
              onChange={(e) => {
                setSeverity(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{vi.notificationCenter.allSeverity}</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{vi.notificationCenter.allType}</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{vi.notificationCenter.allSource}</option>
              {SOURCES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              value={readFilter}
              onChange={(e) => {
                setReadFilter(e.target.value as 'all' | 'read' | 'unread');
                setPage(1);
              }}
            >
              <option value="all">{vi.app.all}</option>
              <option value="unread">{vi.notificationCenter.unread}</option>
              <option value="read">{vi.notificationCenter.read}</option>
            </select>
            <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
            <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void load()} disabled={loading}>
                {vi.app.refresh}
              </Button>
              <Button type="button" variant="secondary" onClick={() => void markAllRead()}>
                {vi.notificationCenter.markAllRead}
              </Button>
            </div>
          </div>
        </MonitoringFilterBar>

        {error && <ErrorMessage message={error} />}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <button
              type="button"
              className={cn('rounded-lg px-3 py-1.5 text-sm', view === 'table' ? 'bg-admin-100 font-medium' : 'text-zinc-600')}
              onClick={() => setView('table')}
            >
              {vi.notificationCenter.tableView}
            </button>
            <button
              type="button"
              className={cn('rounded-lg px-3 py-1.5 text-sm', view === 'timeline' ? 'bg-admin-100 font-medium' : 'text-zinc-600')}
              onClick={() => setView('timeline')}
            >
              {vi.notificationCenter.timelineView}
            </button>
          </div>
          {canManage && selected.size > 0 && (
            <div className="flex gap-2">
              <Button type="button" onClick={() => void bulkMarkRead()}>
                {vi.notificationCenter.markRead} ({selected.size})
              </Button>
              <Button type="button" variant="secondary" onClick={() => void bulkDismiss()}>
                {vi.notificationCenter.dismiss} ({selected.size})
              </Button>
            </div>
          )}
          {canManage && (
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => void systemNotificationApi.exportCsv({ severity, type, source, date_from: dateFrom, date_to: dateTo })}>
                {vi.app.exportCsv}
              </Button>
              <Button type="button" variant="secondary" onClick={() => void systemNotificationApi.exportExcel({ severity, type, source, date_from: dateFrom, date_to: dateTo })}>
                Excel
              </Button>
            </div>
          )}
        </div>

        {view === 'table' ? (
          <Card className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-zinc-500">
                  {canManage && (
                    <th className="px-3 py-2">
                      <input type="checkbox" checked={selected.size === items.length && items.length > 0} onChange={toggleAll} />
                    </th>
                  )}
                  <th className="px-3 py-2">{vi.notificationCenter.severity}</th>
                  <th className="px-3 py-2">{vi.notificationCenter.type}</th>
                  <th className="px-3 py-2">{vi.activityLog.titleLabel}</th>
                  <th className="px-3 py-2">{vi.activityLog.source}</th>
                  <th className="px-3 py-2">Resource</th>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">{vi.app.actions}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className={cn('border-b border-zinc-50', row.isRead && 'opacity-70')}>
                    {canManage && (
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)} />
                      </td>
                    )}
                    <td className={cn('px-3 py-2 font-medium', SEVERITY_ROW[row.severity])}>{row.severity}</td>
                    <td className="px-3 py-2">{row.notificationType}</td>
                    <td className="px-3 py-2">
                      <p className="font-medium">{row.title}</p>
                      <p className="text-xs text-zinc-500 line-clamp-1">{row.message}</p>
                    </td>
                    <td className="px-3 py-2">{row.source}</td>
                    <td className="px-3 py-2">{row.resourceDisplay ?? row.resource ?? '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        {!row.isRead && (
                          <button type="button" className="text-admin-600 hover:underline" onClick={() => void systemNotificationApi.markRead(row.id).then(load)}>
                            {vi.notificationCenter.markRead}
                          </button>
                        )}
                        {row.resourceHref && (
                          <Link href={row.resourceHref} className="text-admin-600 hover:underline">
                            {vi.notificationCenter.openResource}
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 && !loading && (
              <p className="py-8 text-center text-sm text-zinc-500">{vi.notificationCenter.empty}</p>
            )}
          </Card>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <NotificationCard key={item.id} item={item} />
            ))}
            {items.length === 0 && !loading && (
              <p className="py-8 text-center text-sm text-zinc-500">{vi.notificationCenter.empty}</p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-500">
            {total.toLocaleString('vi-VN')} {vi.notificationCenter.records}
          </p>
          <div className="flex items-center gap-2">
            <select
              className="rounded border border-zinc-200 px-2 py-1 text-sm"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>{s} / trang</option>
              ))}
            </select>
            <select
              className="rounded border border-zinc-200 px-2 py-1 text-sm"
              value={sort}
              onChange={(e) => setSort(e.target.value as 'newest' | 'oldest')}
            >
              <option value="newest">{vi.systemAudit.newest}</option>
              <option value="oldest">{vi.systemAudit.oldest}</option>
            </select>
            <Button type="button" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              ←
            </Button>
            <span className="text-sm">{page} / {totalPages}</span>
            <Button type="button" variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              →
            </Button>
          </div>
        </div>
      </div>
    </RequirePermission>
  );
}
