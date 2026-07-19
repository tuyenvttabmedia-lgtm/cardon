'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Label } from '@/components/ui/Input';
import { OrdersDataTable } from '@/components/orders/OrdersOperations';
import { OrdersPageShell } from '@/components/orders/OrdersSubNav';
import { useAgentPlatform } from '@/hooks/useAgentPlatform';
import { exportLedgerCsv } from '@/lib/finance/constants';
import { orderOperationsApi } from '@/services/api-client';
import type { AgentOrderListRow } from '@/types/platform';

const STATUS_FILTERS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'pending', label: 'Đang xử lý' },
  { id: 'completed', label: 'Hoàn tất' },
  { id: 'failed', label: 'Thất bại' },
] as const;

export default function OrdersSearchPageClient() {
  const { can } = useAgentPlatform();
  const canExport = can('orders.export');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [orders, setOrders] = useState<AgentOrderListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const take = 25;

  useEffect(() => {
    setLoading(true);
    const q = search.trim();
    const loader = q
      ? orderOperationsApi.search(q, page * take, take)
      : orderOperationsApi.listOrders({ status: status === 'all' ? undefined : status, skip: page * take, take });
    void loader
      .then((res) => {
        setOrders(res.items);
        setTotal(res.total);
      })
      .catch(() => {
        setOrders([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [search, status, page]);

  function handleExport() {
    void orderOperationsApi.export('csv', { search: search.trim() || undefined, status: status === 'all' ? undefined : status }).then((res) => {
      if (res.mode === 'immediate' && res.rows) {
        exportLedgerCsv(res.rows as Record<string, unknown>[], 'don-hang-api.csv');
      }
    });
    void orderOperationsApi.audit('export', { page: 'search', count: orders.length });
  }

  const totalPages = Math.max(1, Math.ceil(total / take));

  return (
    <OrdersPageShell
      title="Tra cứu đơn hàng API"
      description="Tìm theo Request ID, Order ID, Partner Order, Gateway Ref, Provider Ref, API Key, Customer Ref."
    >
      <Card className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div>
            <Label htmlFor="search">Tra cứu toàn cục</Label>
            <Input
              id="search"
              className="mt-1"
              placeholder="Request ID, Order ID, Partner Order, Provider Ref..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </div>
          {canExport && (
            <div className="flex items-end">
              <Button size="sm" variant="secondary" onClick={handleExport}>
                Xuất CSV
              </Button>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setStatus(t.id);
                setPage(0);
              }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                status === t.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-0">
        <OrdersDataTable orders={orders} loading={loading} />
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm dark:border-slate-800">
          <span className="text-slate-500">
            {total} kết quả · trang {page + 1}/{totalPages}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Trước
            </Button>
            <Button size="sm" variant="secondary" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Sau
            </Button>
          </div>
        </div>
      </Card>
    </OrdersPageShell>
  );
}
