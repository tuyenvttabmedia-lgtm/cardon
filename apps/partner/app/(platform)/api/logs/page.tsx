'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiPageShell } from '@/components/api/ApiSubNav';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useAgentPlatform } from '@/hooks/useAgentPlatform';
import { formatDateTime } from '@/lib/utils';
import { apiOpsApi, ApiClientError } from '@/services/api-client';
import type { AgentApiLogEntry } from '@/types/platform';

const LOG_TYPES = ['', 'REQUEST', 'ERROR', 'INVALID_KEY', 'INVALID_SIGNATURE', 'BLOCKED_IP', 'AUTH_429'];

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
          {Array.from({ length: 8 }).map((__, j) => (
            <td key={j} className="px-3 py-3">
              <div className="h-4 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default function ApiLogsPage() {
  const { can } = useAgentPlatform();
  const canExport = can('api.manage');
  const [items, setItems] = useState<AgentApiLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiOpsApi.listLogs({
        page,
        limit: 20,
        type: type || undefined,
        search: search.trim() || undefined,
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Không tải được nhật ký API');
    } finally {
      setLoading(false);
    }
  }, [page, type, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleExport = async (format: 'csv' | 'json') => {
    if (!canExport) return;
    try {
      const result = await apiOpsApi.exportLogs(format, { type, search });
      if (result.mode === 'immediate' && result.rows) {
        const blob = new Blob([JSON.stringify(result.rows, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `api-logs-${Date.now()}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
        setExportMsg(`Đã tải ${result.rowCount} dòng`);
      } else {
        setExportMsg(`Đang xử lý nền — job ${result.jobId?.slice(0, 8)}…`);
      }
    } catch (e) {
      setExportMsg(e instanceof ApiClientError ? e.message : 'Xuất thất bại');
    }
  };

  return (
    <ApiPageShell
      title="Nhật ký API"
      description="Lưu trữ persistent — mọi request Partner API được ghi nhận với latency, status và payload đã che."
    >
      {error && <p className="text-sm text-red-600">{error}</p>}
      {exportMsg && <p className="text-sm text-emerald-600">{exportMsg}</p>}

      <Card className="flex flex-wrap gap-2 p-4">
        <select
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
        >
          {LOG_TYPES.map((t) => (
            <option key={t || 'all'} value={t}>
              {t || 'Tất cả loại'}
            </option>
          ))}
        </select>
        <Input
          className="min-w-[220px] flex-1"
          placeholder="Request ID, Order ID, IP, keyword…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void load()}
        />
        <Button variant="secondary" onClick={() => void load()}>
          Tìm kiếm
        </Button>
        {canExport && (
          <>
            <Button variant="secondary" size="sm" onClick={() => void handleExport('json')}>
              Xuất JSON
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void handleExport('csv')}>
              Xuất CSV
            </Button>
          </>
        )}
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-900">
            <tr>
              <th className="px-3 py-3">Thời gian</th>
              <th className="px-3 py-3">Request ID</th>
              <th className="px-3 py-3">Endpoint</th>
              <th className="px-3 py-3">HTTP</th>
              <th className="px-3 py-3">Latency</th>
              <th className="px-3 py-3">IP</th>
              <th className="px-3 py-3">Loại</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows />
            ) : !items.length ? (
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center text-slate-500">
                  Chưa có nhật ký — gọi API để tạo bản ghi.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-3 whitespace-nowrap">{formatDateTime(row.at)}</td>
                  <td className="px-3 py-3 font-mono text-xs">{row.requestId ?? '—'}</td>
                  <td className="max-w-[200px] truncate px-3 py-3 font-mono text-xs" title={row.path ?? ''}>
                    {row.method} {row.path}
                  </td>
                  <td className="px-3 py-3">{row.httpStatus ?? '—'}</td>
                  <td className="px-3 py-3">{row.latencyMs != null ? `${row.latencyMs}ms` : '—'}</td>
                  <td className="px-3 py-3">{row.ip ?? '—'}</td>
                  <td className="px-3 py-3">
                    <Badge tone={row.httpStatus && row.httpStatus >= 400 ? 'danger' : 'success'}>{row.type}</Badge>
                  </td>
                  <td className="px-3 py-3">
                    <Link href={`/api/logs/${row.id}`} className="text-indigo-600 hover:underline dark:text-indigo-400">
                      Chi tiết
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {!loading && total > 20 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            Trang {page} · {total} bản ghi
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Trước
            </Button>
            <Button variant="secondary" size="sm" disabled={page * 20 >= total} onClick={() => setPage((p) => p + 1)}>
              Sau
            </Button>
          </div>
        </div>
      )}
    </ApiPageShell>
  );
}
