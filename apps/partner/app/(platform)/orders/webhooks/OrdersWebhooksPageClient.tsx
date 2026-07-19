'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { OrdersPageShell } from '@/components/orders/OrdersSubNav';
import { orderOperationsApi } from '@/services/api-client';
import type { AgentOrderWebhookEntry } from '@/types/platform';

export default function OrdersWebhooksPageClient() {
  const [items, setItems] = useState<AgentOrderWebhookEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void orderOperationsApi
      .listWebhooks({ take: 50 })
      .then((res) => setItems(res.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <OrdersPageShell
      title="Giám sát Webhook"
      description="Theo dõi trạng thái webhook outbound — chỉ đọc, không thay đổi logic."
    >
      <Card className="overflow-x-auto p-0">
        {loading ? (
          <p className="p-4 text-sm text-slate-500">Đang tải...</p>
        ) : items.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">Chưa có webhook nào.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-900">
              <tr>
                <th className="px-4 py-3">Request ID</th>
                <th className="px-4 py-3">Received</th>
                <th className="px-4 py-3">Verified</th>
                <th className="px-4 py-3">Processed</th>
                <th className="px-4 py-3">Completed</th>
                <th className="px-4 py-3">Failed</th>
                <th className="px-4 py-3">Retry</th>
                <th className="px-4 py-3">Xử lý</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((w) => (
                <tr key={w.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-3 font-mono text-xs">{w.requestId ?? '—'}</td>
                  <td className="px-4 py-3"><Badge tone={w.received ? 'success' : 'default'}>{w.received ? 'Có' : 'Không'}</Badge></td>
                  <td className="px-4 py-3"><Badge tone={w.verified ? 'success' : 'warning'}>{w.verified ? 'OK' : '—'}</Badge></td>
                  <td className="px-4 py-3"><Badge tone={w.processed ? 'success' : 'default'}>{w.processed ? 'Có' : 'Chờ'}</Badge></td>
                  <td className="px-4 py-3"><Badge tone={w.completed ? 'success' : 'default'}>{w.completed ? 'Có' : '—'}</Badge></td>
                  <td className="px-4 py-3"><Badge tone={w.failed ? 'danger' : 'default'}>{w.failed ? 'Có' : '—'}</Badge></td>
                  <td className="px-4 py-3">{w.retry}</td>
                  <td className="px-4 py-3">{w.processingTimeMs}ms</td>
                  <td className="px-4 py-3">
                    <Link href={`/orders/${w.orderId}`} className="text-indigo-600 hover:underline">Chi tiết</Link>
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
