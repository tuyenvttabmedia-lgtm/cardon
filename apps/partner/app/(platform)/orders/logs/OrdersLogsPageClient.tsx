'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Input, Label } from '@/components/ui/Input';
import { OrdersPageShell } from '@/components/orders/OrdersSubNav';
import { orderOperationsApi } from '@/services/api-client';
import { formatDateTime } from '@/lib/utils';

export default function OrdersLogsPageClient() {
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<Array<{ id: string; title: string; description: string | null; createdAt: string; eventType: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void orderOperationsApi
      .listLogs({ search: search.trim() || undefined, take: 50 })
      .then((res) => setItems(res.items as typeof items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [search]);

  return (
    <OrdersPageShell title="Nhật ký hoạt động" description="Ghi nhận xem chi tiết, tra cứu, xuất, retry và timeline — không ghi audit cấu hình.">
      <Card className="space-y-4">
        <div>
          <Label htmlFor="log-search">Tìm trong nhật ký</Label>
          <Input id="log-search" className="mt-1" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tiêu đề, mô tả, resource..." />
        </div>
      </Card>
      <Card className="divide-y divide-slate-100 p-0 dark:divide-slate-800">
        {loading ? (
          <p className="p-4 text-sm text-slate-500">Đang tải...</p>
        ) : items.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">Chưa có nhật ký.</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.title}</p>
                <span className="text-xs text-slate-500">{formatDateTime(item.createdAt)}</span>
              </div>
              {item.description && <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{item.description}</p>}
              <p className="mt-1 font-mono text-[10px] text-slate-400">{item.eventType}</p>
            </div>
          ))
        )}
      </Card>
    </OrdersPageShell>
  );
}
