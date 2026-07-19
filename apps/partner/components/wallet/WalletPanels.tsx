'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { formatDateTime, formatVnd } from '@/lib/utils';
import type { WalletRecentActivity } from '@/types/platform';

export function RecentActivityPanel({ activity }: { activity: WalletRecentActivity | null }) {
  if (!activity) return null;

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm font-semibold text-slate-900">Bút toán gần nhất</p>
        <ul className="mt-3 space-y-2">
          {activity.ledgerEntries.slice(0, 5).map((e) => (
            <li key={e.id} className="flex justify-between text-xs text-slate-600">
              <span>{e.type}</span>
              <span>{formatVnd(e.amount)}</span>
            </li>
          ))}
          {activity.ledgerEntries.length === 0 && (
            <li className="text-xs text-slate-400">Chưa có bút toán</li>
          )}
        </ul>
        <Link href="/wallet/ledger" className="mt-3 inline-block text-xs font-medium text-indigo-600">
          Xem sổ quỹ →
        </Link>
      </Card>

      <Card>
        <p className="text-sm font-semibold text-slate-900">Đơn hàng gần đây</p>
        <ul className="mt-3 space-y-2">
          {activity.recentOrders.map((o) => (
            <li key={o.id} className="text-xs text-slate-600">
              <span className="font-mono">{o.orderCode ?? o.id.slice(0, 8)}</span> — {formatVnd(o.amount)}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <p className="text-sm font-semibold text-slate-900">Đang chờ xử lý</p>
        <dl className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
          <div>
            <dt className="text-slate-400">Nạp tiền</dt>
            <dd className="font-semibold">{activity.pendingItems.deposits}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Rút tiền</dt>
            <dd className="font-semibold">{activity.pendingItems.withdraws}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Đối soát</dt>
            <dd className="font-semibold">{activity.pendingItems.settlement}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}

export function BalanceSummaryCard({
  summary,
}: {
  summary: {
    openingBalance: { available: string };
    credits: string;
    debits: string;
    closingBalance: { available: string };
    pendingAmount: string;
    frozenAmount: string;
    availableAmount: string;
  } | null;
}) {
  if (!summary) return null;
  return (
    <Card>
      <p className="text-sm font-semibold text-slate-900">Tóm tắt số dư</p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <div>
          <dt className="text-slate-500">Đầu kỳ</dt>
          <dd className="font-medium">{formatVnd(summary.openingBalance.available)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Ghi có</dt>
          <dd className="font-medium text-emerald-700">{formatVnd(summary.credits)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Ghi nợ</dt>
          <dd className="font-medium text-red-700">{formatVnd(summary.debits)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Cuối kỳ</dt>
          <dd className="font-medium">{formatVnd(summary.closingBalance.available)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Đang chờ</dt>
          <dd>{formatVnd(summary.pendingAmount)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Đóng băng</dt>
          <dd>{formatVnd(summary.frozenAmount)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Khả dụng</dt>
          <dd className="font-semibold">{formatVnd(summary.availableAmount)}</dd>
        </div>
      </dl>
    </Card>
  );
}
