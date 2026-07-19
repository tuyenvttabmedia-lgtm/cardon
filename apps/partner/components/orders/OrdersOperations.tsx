'use client';

import Link from 'next/link';
import { Badge, statusToBadgeTone } from '@/components/ui/Badge';
import { cn, formatDateTime, formatVnd, transactionStatusLabel } from '@/lib/utils';
import type { AgentOrderListRow } from '@/types/platform';

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
          {Array.from({ length: 8 }).map((__, j) => (
            <td key={j} className="px-4 py-3">
              <div className="h-4 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function OrdersDataTable({
  orders,
  loading,
  compact,
}: {
  orders: AgentOrderListRow[];
  loading?: boolean;
  compact?: boolean;
}) {
  if (loading) {
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-900 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Request ID</th>
              <th className="px-4 py-3">Sản phẩm</th>
              <th className="px-4 py-3">Giá bán</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3">Thời gian</th>
              <th className="px-4 py-3">Độ trễ</th>
              <th className="px-4 py-3">Provider</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            <SkeletonRows />
          </tbody>
        </table>
      </div>
    );
  }

  if (!orders.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Chưa có đơn hàng API</p>
        <p className="max-w-sm text-xs text-slate-500">Đơn hàng được tạo qua API — không có checkout thủ công.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          <tr>
            <th className="px-4 py-3">Request ID</th>
            <th className="px-4 py-3">Order ID</th>
            {!compact && <th className="px-4 py-3">Gateway</th>}
            <th className="px-4 py-3">Sản phẩm</th>
            <th className="px-4 py-3">Giá bán</th>
            {!compact && <th className="px-4 py-3">Lợi nhuận</th>}
            <th className="px-4 py-3">Trạng thái</th>
            <th className="px-4 py-3">Tạo lúc</th>
            <th className="px-4 py-3">Độ trễ</th>
            {!compact && <th className="px-4 py-3">Provider</th>}
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-t border-slate-100 dark:border-slate-800">
              <td className="px-4 py-3 font-mono text-xs">{order.requestId || '—'}</td>
              <td className="px-4 py-3 font-mono text-xs">{order.orderId}</td>
              {!compact && <td className="px-4 py-3">{order.gateway}</td>}
              <td className="px-4 py-3">{order.productName || order.product}</td>
              <td className="px-4 py-3">{formatVnd(order.sellPrice)}</td>
              {!compact && <td className="px-4 py-3">{formatVnd(order.profit)}</td>}
              <td className="px-4 py-3">
                <Badge tone={statusToBadgeTone(order.status)}>{transactionStatusLabel(order.status)}</Badge>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(order.createdAt)}</td>
              <td className="px-4 py-3">{order.latencyMs != null ? `${order.latencyMs}ms` : '—'}</td>
              {!compact && <td className="px-4 py-3 text-xs">{order.provider ?? '—'}</td>}
              <td className="px-4 py-3">
                <Link href={`/orders/${order.id}`} className="text-indigo-600 hover:underline dark:text-indigo-400">
                  Chi tiết
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OrdersChartBars({
  title,
  points,
  labelKey,
}: {
  title: string;
  points: Array<Record<string, string | number>>;
  labelKey: string;
}) {
  if (!points.length) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
        <p className="mt-4 text-sm text-slate-500">Chưa có dữ liệu.</p>
      </div>
    );
  }
  const max = Math.max(...points.map((p) => Number(p.total) || 0), 1);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
      <div className="mt-4 flex h-32 items-end gap-1 overflow-x-auto">
        {points.map((p) => {
          const h = Math.max(6, (Number(p.total) / max) * 100);
          return (
            <div key={String(p[labelKey])} className="flex min-w-[28px] flex-1 flex-col items-center gap-1">
              <div
                className={cn('w-full rounded-t bg-indigo-500/80')}
                style={{ height: `${h}%` }}
                title={`${String(p[labelKey])}: ${p.total}`}
              />
              <span className="text-[9px] text-slate-400">{String(p[labelKey]).slice(-5)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function OrderLifecycleTimeline({
  steps,
}: {
  steps: Array<{ stage: string; status: string; at: string; label?: string }>;
}) {
  return (
    <ol className="relative space-y-0 border-l border-slate-200 pl-6 dark:border-slate-700">
      {steps.map((step, i) => (
        <li key={`${step.stage}-${i}`} className="pb-6 last:pb-0">
          <span
            className={cn(
              'absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white',
              step.status === 'completed' && 'bg-emerald-500',
              step.status === 'failed' && 'bg-red-500',
              step.status === 'active' && 'bg-amber-400',
              step.status === 'processing' && 'bg-indigo-400',
              step.status === 'pending' && 'bg-slate-300',
            )}
          />
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{step.label ?? step.stage}</p>
          <p className="text-xs text-slate-500">{formatDateTime(step.at)} · {step.status}</p>
        </li>
      ))}
    </ol>
  );
}
