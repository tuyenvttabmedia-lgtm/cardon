'use client';

import { useEffect, useState } from 'react';
import { StatCard } from '@/components/ui/Card';
import { OrdersChartBars, OrdersDataTable } from '@/components/orders/OrdersOperations';
import { OrdersPageShell } from '@/components/orders/OrdersSubNav';
import { orderOperationsApi } from '@/services/api-client';
import { formatVnd } from '@/lib/utils';
import type { AgentOrderListRow, AgentOrderStatistics } from '@/types/platform';

function formatMs(ms: number) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

export default function OrdersOverviewPageClient() {
  const [stats, setStats] = useState<AgentOrderStatistics | null>(null);
  const [recent, setRecent] = useState<AgentOrderListRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([
      orderOperationsApi.getStatistics().then(setStats),
      orderOperationsApi.listOrders({ take: 10 }).then((p) => setRecent(p.items)),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const cards = stats?.cards;

  return (
    <OrdersPageShell
      title="Trung tâm vận hành đơn hàng API"
      description="Giám sát đơn hàng B2B qua API — không có checkout thủ công."
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tổng đơn hôm nay" value={loading ? '…' : String(cards?.totalToday ?? 0)} />
        <StatCard label="Đơn thành công" value={loading ? '…' : String(cards?.successToday ?? 0)} />
        <StatCard label="Đơn thất bại" value={loading ? '…' : String(cards?.failedToday ?? 0)} />
        <StatCard label="Đang xử lý" value={loading ? '…' : String(cards?.processingToday ?? 0)} />
        <StatCard label="Refund" value={loading ? '…' : String(cards?.refundToday ?? 0)} />
        <StatCard label="Tỷ lệ thành công" value={loading ? '…' : `${cards?.successRate ?? 0}%`} />
        <StatCard label="Thời gian phản hồi TB" value={loading ? '…' : formatMs(cards?.avgLatencyMs ?? 0)} />
        <StatCard label="Độ trễ eSale" value={loading ? '…' : formatMs(cards?.esaleLatencyMs ?? 0)} />
        <StatCard label="Gateway đang dùng" value={loading ? '…' : (cards?.gatewayInUse ?? 'WALLET')} />
        <StatCard label="Số dư ví" value={loading ? '…' : formatVnd(cards?.walletBalance ?? '0')} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <OrdersChartBars title="Theo giờ" points={stats?.charts.hourly ?? []} labelKey="hour" />
        <OrdersChartBars title="Theo ngày" points={stats?.charts.daily ?? []} labelKey="date" />
        <OrdersChartBars
          title="Theo sản phẩm"
          points={(stats?.charts.byProduct ?? []).map((p) => ({ sku: p.sku, total: p.count }))}
          labelKey="sku"
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-0 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Đơn hàng gần đây</h2>
        </div>
        <OrdersDataTable orders={recent} loading={loading} compact />
      </div>
    </OrdersPageShell>
  );
}
