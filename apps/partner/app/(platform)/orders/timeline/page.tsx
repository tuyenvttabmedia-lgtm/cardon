'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { OrdersPageShell } from '@/components/orders/OrdersSubNav';
import { Card } from '@/components/ui/Card';
import { Badge, statusToBadgeTone } from '@/components/ui/Badge';
import { orderOperationsApi } from '@/services/api-client';
import { formatDateTime, formatVnd, transactionStatusLabel } from '@/lib/utils';
import type { AgentOrderListPage } from '@/types/platform';

export default function OrdersTimelinePage() {
  const [data, setData] = useState<AgentOrderListPage | null>(null);

  useEffect(() => {
    void orderOperationsApi.listOrders({ take: 20, skip: 0 }).then(setData).catch(() => setData(null));
  }, []);

  return (
    <OrdersPageShell
      title="Timeline"
      description="Dòng thời gian đơn hàng API — xem chi tiết và trace từng bước xử lý."
    >
      <Card className="overflow-x-auto p-0">
        {!data?.items.length ? (
          <p className="p-6 text-center text-sm text-slate-500">Chưa có đơn API nào.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Thời gian</th>
                <th className="px-4 py-3">Mã đơn</th>
                <th className="px-4 py-3">Số tiền</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((order) => (
                <tr key={order.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(order.createdAt)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{order.requestId}</td>
                  <td className="px-4 py-3">{formatVnd(order.sellPrice)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusToBadgeTone(order.status)}>
                      {transactionStatusLabel(order.status)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/orders/${order.orderId}`} className="text-indigo-600 hover:underline">
                      Chi tiết
                    </Link>
                    {' · '}
                    <Link href={`/orders/${order.orderId}/trace`} className="text-indigo-600 hover:underline">
                      Trace
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </OrdersPageShell>
  );
}
