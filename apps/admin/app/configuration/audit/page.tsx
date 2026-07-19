'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { RequirePermission } from '@/components/layout/AdminShell';
import { AuditLogDrawer } from '@/components/configuration/AuditLogDrawer';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input } from '@/components/ui/Form';
import { useAuth } from '@/hooks/useAuth';
import { vi } from '@/lib/i18n/vi';
import { formatDateTime, ROLE_LABELS } from '@/lib/utils';
import { systemAuditApi, ApiClientError } from '@/services/api-client';
import type { SystemAuditLog, SystemAuditLogStats } from '@/types/api';

const RESOURCES = [
  'SMTP',
  'SEO',
  'SYSTEM',
  'FEATURE_FLAG',
  'PROVIDER',
  'PAYMENT_GATEWAY',
  'SETTING',
  'CMS',
] as const;

const ACTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'ENABLE',
  'DISABLE',
] as const;

const ROLES = ['SUPER_ADMIN', 'ADMIN'] as const;

const PAGE_SIZES = [20, 50, 100] as const;

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="text-center">
      <p className="text-2xl font-bold text-admin-700">{value.toLocaleString('vi-VN')}</p>
      <p className="mt-1 text-sm text-zinc-500">{label}</p>
    </Card>
  );
}

export default function ConfigurationAuditPageWrapper() {
  return (
    <Suspense fallback={<p className="text-zinc-500">{vi.app.loading}</p>}>
      <ConfigurationAuditPage />
    </Suspense>
  );
}

const MODULE_RESOURCE: Record<string, string> = {
  payment: 'PAYMENT_GATEWAY',
  providers: 'PROVIDER',
  smtp: 'SMTP',
  system: 'SYSTEM',
  orders: 'SETTING',
  telegram: 'SETTING',
  webhooks: 'PAYMENT_GATEWAY',
  maintenance: 'SETTING',
  backup: 'SETTING',
  security: 'SETTING',
  integrations: 'SETTING',
  advanced: 'SYSTEM',
};

function ConfigurationAuditPage() {
  const searchParams = useSearchParams();
  const [logs, setLogs] = useState<SystemAuditLog[]>([]);
  const [stats, setStats] = useState<SystemAuditLogStats>({
    today: 0,
    yesterday: 0,
    thisMonth: 0,
    total: 0,
  });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<number>(20);
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [keyword, setKeyword] = useState('');
  const [resource, setResource] = useState('');
  const [action, setAction] = useState('');
  const [role, setRole] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<SystemAuditLog | null>(null);
  const { can } = useAuth();
  const canExport = can('audit.export');

  useEffect(() => {
    const module = searchParams.get('module');
    if (module) {
      setResource(MODULE_RESOURCE[module] ?? module.toUpperCase());
    }
  }, [searchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await systemAuditApi.list({
        page,
        limit,
        sort,
        keyword: keyword || undefined,
        resource: resource || undefined,
        action: action || undefined,
        role: role || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      setLogs(result.items);
      setStats(result.stats);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.systemAudit.loadError);
    } finally {
      setLoading(false);
    }
  }, [page, limit, sort, keyword, resource, action, role, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const filterParams = {
    keyword: keyword || undefined,
    resource: resource || undefined,
    action: action || undefined,
    role: role || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    sort,
  };

  return (
    <RequirePermission permission="audit.read">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={vi.systemAudit.today} value={stats.today} />
          <StatCard label={vi.systemAudit.yesterday} value={stats.yesterday} />
          <StatCard label={vi.systemAudit.thisMonth} value={stats.thisMonth} />
          <StatCard label={vi.systemAudit.total} value={stats.total} />
        </div>

        <Card>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Input
              placeholder={vi.systemAudit.searchPlaceholder}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <select
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              value={resource}
              onChange={(e) => setResource(e.target.value)}
            >
              <option value="">{vi.systemAudit.allResources}</option>
              {RESOURCES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            >
              <option value="">{vi.systemAudit.allActions}</option>
              {ACTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="">{vi.systemAudit.allRoles}</option>
              {ROLES.map((item) => (
                <option key={item} value={item}>
                  {ROLE_LABELS[item] ?? item}
                </option>
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
              {canExport && (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => void systemAuditApi.exportCsv(filterParams)}
                  >
                    CSV
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => void systemAuditApi.exportExcel(filterParams)}
                  >
                    Excel
                  </Button>
                </>
              )}
            </div>
          </div>
        </Card>

        {error && <ErrorMessage message={error} />}

        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-zinc-500">
                  <th className="py-2 pr-4">{vi.audit.time}</th>
                  <th className="py-2 pr-4">{vi.audit.user}</th>
                  <th className="py-2 pr-4">{vi.systemAudit.role}</th>
                  <th className="py-2 pr-4">{vi.systemAudit.resource}</th>
                  <th className="py-2 pr-4">{vi.audit.action}</th>
                  <th className="py-2 pr-4">{vi.systemAudit.field}</th>
                  <th className="py-2 pr-4">IP</th>
                  <th className="py-2">{vi.systemAudit.reason}</th>
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
                    <td className="py-3 pr-4">{log.performedEmail}</td>
                    <td className="py-3 pr-4">{ROLE_LABELS[log.performedRole] ?? log.performedRole}</td>
                    <td className="py-3 pr-4">{log.resourceName ?? log.resource}</td>
                    <td className="py-3 pr-4 font-mono text-xs">{log.action}</td>
                    <td className="py-3 pr-4 font-mono text-xs">{log.fieldName ?? '—'}</td>
                    <td className="py-3 pr-4 font-mono text-xs">{log.ipAddress ?? '—'}</td>
                    <td className="py-3 max-w-[12rem] truncate">{log.reason ?? '—'}</td>
                  </tr>
                ))}
                {!loading && logs.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-zinc-400">
                      {vi.common.noData}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

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
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {vi.common.prev}
              </Button>
              <span className="text-sm text-zinc-500">
                {vi.common.page} {page}/{totalPages}
              </span>
              <Button
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                {vi.common.next}
              </Button>
            </div>
          </div>
        </Card>

        <AuditLogDrawer log={selected} onClose={() => setSelected(null)} />
      </div>
    </RequirePermission>
  );
}
