'use client';

import { cn, formatVnd } from '@/lib/utils';
import type { AdminOrderSummary } from '@/types/api';

export function OrderSummaryCards({
  summary,
  rangeLabel,
  loading,
}: {
  summary: AdminOrderSummary | null;
  rangeLabel: string;
  loading?: boolean;
}) {
  const cards = [
    {
      key: 'revenue',
      label: 'Doanh thu',
      value: summary ? formatVnd(summary.totalRevenue) : '—',
      hint: 'Σ sellAmount · PAID · VND',
    },
    {
      key: 'cost',
      label: 'Giá vốn NCC',
      value: summary ? formatVnd(summary.providerCost) : '—',
      hint: 'Σ providerCost · VND',
    },
    {
      key: 'fee',
      label: 'Phí thanh toán',
      value: summary ? formatVnd(summary.gatewayFee) : '—',
      hint: 'Σ paymentFeeAmount · VND',
    },
    {
      key: 'profit',
      label: 'Lợi nhuận',
      value: summary ? formatVnd(summary.profit) : '—',
      hint: 'Doanh thu − giá vốn − phí',
      highlight: summary ? Number(summary.profit) : 0,
    },
    {
      key: 'orders',
      label: 'Số đơn',
      value: summary ? String(summary.orderCount) : '—',
      hint: `Giao xong ${summary?.deliveredCount ?? '—'}`,
    },
    {
      key: 'rate',
      label: 'Tỷ lệ thành công',
      value: summary ? `${summary.successRate}%` : '—',
      hint: 'COMPLETED / tổng đơn trong kỳ',
    },
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Tổng quan vận hành
          </p>
          <p className="text-[11px] text-slate-400">
            Kỳ KPI: <span className="font-medium text-slate-600">{rangeLabel}</span> · đơn vị VND ·
            Asia/Ho_Chi_Minh
          </p>
        </div>
        {loading ? <p className="text-[11px] text-slate-400">Đang cập nhật…</p> : null}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {cards.map((card) => (
          <div
            key={card.key}
            className={cn(
              'rounded-lg border px-3 py-2.5',
              card.key === 'profit'
                ? Number(card.highlight) > 0
                  ? 'border-emerald-200 bg-emerald-50/60'
                  : 'border-amber-200 bg-amber-50/60'
                : 'border-slate-200 bg-white',
            )}
          >
            <p className="text-[11px] font-medium text-slate-500">{card.label}</p>
            <p
              className={cn(
                'mt-0.5 text-base font-semibold tabular-nums text-slate-900 sm:text-lg',
                card.key === 'profit' &&
                  (Number(card.highlight) > 0 ? 'text-emerald-700' : 'text-amber-700'),
              )}
            >
              {card.value}
            </p>
            <p className="mt-0.5 truncate text-[10px] text-slate-400" title={card.hint}>
              {card.hint}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
