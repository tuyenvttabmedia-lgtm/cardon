'use client';

import { Card } from '@/components/ui/Display';
import { formatVnd } from '@/lib/utils';
import type { AdminOrderSummary } from '@/types/api';

export function OrderSummaryCards({ summary }: { summary: AdminOrderSummary | null }) {
  if (!summary) return null;

  const cards = [
    { label: 'Tổng doanh thu', value: formatVnd(summary.totalRevenue) },
    { label: 'Giá vốn NCC', value: formatVnd(summary.providerCost) },
    { label: 'Phí thanh toán', value: formatVnd(summary.gatewayFee) },
    { label: 'Lợi nhuận', value: formatVnd(summary.profit), highlight: true },
    { label: 'Số đơn', value: String(summary.orderCount) },
    { label: 'Tỉ lệ thành công', value: `${summary.successRate}%` },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((c) => (
        <Card key={c.label} className="p-4">
          <p className="text-xs text-zinc-500">{c.label}</p>
          <p
            className={`mt-1 text-lg font-semibold ${
              c.highlight
                ? Number(summary.profit) > 0
                  ? 'text-emerald-700'
                  : 'text-amber-700'
                : ''
            }`}
          >
            {c.value}
          </p>
        </Card>
      ))}
    </div>
  );
}
