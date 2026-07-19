'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { OrdersDataTable } from '@/components/orders/OrdersOperations';
import { OrdersPageShell } from '@/components/orders/OrdersSubNav';
import { orderOperationsApi } from '@/services/api-client';
import type { AgentOrderListRow } from '@/types/platform';

export default function OrdersHistoryPageClient() {
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [orders, setOrders] = useState<AgentOrderListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const take = 25;

  useEffect(() => {
    setLoading(true);
    void orderOperationsApi
      .listOrders({ skip: page * take, take })
      .then((res) => {
        setOrders(res.items);
        setTotal(res.total);
      })
      .catch(() => {
        setOrders([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / take));

  return (
    <OrdersPageShell title="Lịch sử đơn hàng API" description="Toàn bộ request API đã gửi qua kênh đại lý — phân trang phía máy chủ.">
      <Card className="p-0">
        <OrdersDataTable orders={orders} loading={loading} />
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm dark:border-slate-800">
          <span className="text-slate-500">{total} đơn · trang {page + 1}/{totalPages}</span>
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
