'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiPageShell } from '@/components/api/ApiSubNav';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useAgentPlatform } from '@/hooks/useAgentPlatform';
import { cn, formatDateTime } from '@/lib/utils';
import { webhookDeliveryApi, ApiClientError } from '@/services/api-client';
import type {
  WebhookDeliveryListItem,
  WebhookDeliveryStatistics,
} from '@/types/platform';

const TABS = [
  { id: 'history' as const, label: 'Lịch sử giao' },
  { id: 'retry' as const, label: 'Hàng đợi thử lại' },
  { id: 'failed' as const, label: 'Dead Letter' },
];

function statusTone(status: string) {
  if (status === 'Delivered') return 'success';
  if (status === 'DeadLetter' || status === 'Failed') return 'danger';
  if (status === 'Retrying' || status === 'Sending') return 'warning';
  if (status === 'Cancelled') return 'default';
  return 'info';
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    Pending: 'Chờ giao',
    Sending: 'Đang gửi',
    Delivered: 'Đã giao',
    Retrying: 'Đang thử lại',
    Failed: 'Thất bại',
    DeadLetter: 'Dead Letter',
    Cancelled: 'Đã huỷ',
  };
  return map[status] ?? status;
}

function SkeletonTable() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
          {Array.from({ length: 9 }).map((__, j) => (
            <td key={j} className="px-3 py-3">
              <div className="h-4 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default function WebhookDeliveriesPageClient() {
  const { can } = useAgentPlatform();
  const canManage = can('webhooks.manage');
  const [tab, setTab] = useState<'history' | 'failed' | 'retry'>('history');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<WebhookDeliveryListItem[]>([]);
  const [stats, setStats] = useState<WebhookDeliveryStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, statistics] = await Promise.all([
        webhookDeliveryApi.list({ page, limit: 20, tab, search: search.trim() || undefined }),
        webhookDeliveryApi.getStatistics(),
      ]);
      setItems(list.items);
      setTotal(list.total);
      setStats(statistics);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Không tải được lịch sử giao webhook');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, tab, search]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ApiPageShell
      title="Lịch sử giao Webhook"
      description="Theo dõi callback outbound, trạng thái HTTP, thử lại và Dead Letter."
    >
      {stats && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Card className="p-4">
            <p className="text-xs text-slate-500">24h — Tổng</p>
            <p className="text-xl font-semibold">{stats.total}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500">Đã giao</p>
            <p className="text-xl font-semibold text-emerald-600">{stats.delivered}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500">Đang thử lại</p>
            <p className="text-xl font-semibold text-amber-600">{stats.retrying}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500">Dead Letter</p>
            <p className="text-xl font-semibold text-red-600">{stats.deadLetter}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500">Tỷ lệ thành công</p>
            <p className="text-xl font-semibold">{stats.successRate}%</p>
          </Card>
        </div>
      )}

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 dark:border-slate-700">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setPage(1);
              }}
              className={cn(
                'rounded-lg px-3 py-2 text-sm font-medium transition',
                tab === t.id
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Input
            className="max-w-md"
            placeholder="Tìm Order ID, Request ID, URL…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void load()}
          />
          <Button variant="secondary" onClick={() => void load()}>
            Tìm kiếm
          </Button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="px-3 py-3">Tạo lúc</th>
                <th className="px-3 py-3">Đơn hàng</th>
                <th className="px-3 py-3">Partner Order</th>
                <th className="px-3 py-3">Đích đến</th>
                <th className="px-3 py-3">HTTP</th>
                <th className="px-3 py-3">Lần thử</th>
                <th className="px-3 py-3">Độ trễ</th>
                <th className="px-3 py-3">Kết quả</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonTable />
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-12 text-center text-slate-500">
                    Chưa có bản ghi giao webhook
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-3 whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
                    <td className="px-3 py-3 font-mono text-xs">{row.orderId.slice(0, 8)}…</td>
                    <td className="px-3 py-3 font-mono text-xs">{row.partnerOrderId ?? '—'}</td>
                    <td className="max-w-[180px] truncate px-3 py-3 text-xs" title={row.destination}>
                      {row.destination}
                    </td>
                    <td className="px-3 py-3">{row.httpStatus ?? '—'}</td>
                    <td className="px-3 py-3">{row.attempts}</td>
                    <td className="px-3 py-3">{row.latencyMs != null ? `${row.latencyMs}ms` : '—'}</td>
                    <td className="px-3 py-3">
                      <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge>
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/api/webhook/deliveries/${row.id}`}
                        className="text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        Chi tiết
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && total > 20 && (
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>
              Trang {page} · {total} bản ghi
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Trước
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page * 20 >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Sau
              </Button>
            </div>
          </div>
        )}

        {!canManage && (
          <p className="text-xs text-slate-500">
            Chỉ Owner mới có thể thử giao lại hoặc huỷ webhook từ trang chi tiết.
          </p>
        )}
      </Card>
    </ApiPageShell>
  );
}
