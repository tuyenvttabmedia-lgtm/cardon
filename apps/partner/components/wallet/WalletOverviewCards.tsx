'use client';

import { StatCard } from '@/components/ui/Card';
import { formatDateTime, formatVnd } from '@/lib/utils';
import type { AgentWalletOverviewExtended } from '@/types/platform';

function TrendBars({ points }: { points: Array<{ date: string; balance: string }> }) {
  if (!points.length) return null;
  const max = Math.max(...points.map((p) => parseFloat(p.balance) || 0), 1);
  return (
    <div className="mt-4 flex h-24 items-end gap-1">
      {points.map((p) => {
        const h = Math.max(8, (parseFloat(p.balance) / max) * 100);
        return (
          <div key={p.date} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t bg-indigo-500/80"
              style={{ height: `${h}%` }}
              title={`${p.date}: ${formatVnd(p.balance)}`}
            />
            <span className="text-[9px] text-slate-400">{p.date.slice(5)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function WalletOverviewCards({ wallet }: { wallet: AgentWalletOverviewExtended | null }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Số dư khả dụng" value={formatVnd(wallet?.availableBalance ?? '0')} />
        <StatCard label="Số dư đóng băng" value={formatVnd(wallet?.frozenBalance ?? '0')} />
        <StatCard label="Hạn mức tín dụng" value={formatVnd(wallet?.creditLimit ?? '0')} />
        <StatCard label="Chờ nạp" value={formatVnd(wallet?.pendingDeposit ?? '0')} />
        <StatCard label="Chờ rút" value={formatVnd(wallet?.pendingWithdraw ?? '0')} />
        <StatCard label="Đang đối soát" value={formatVnd(wallet?.pendingSettlement ?? '0')} />
        <StatCard label="Chi tiêu hôm nay" value={formatVnd(wallet?.todaySpending ?? '0')} />
        <StatCard label="Chi tiêu tháng này" value={formatVnd(wallet?.monthSpending ?? '0')} />
        <StatCard label="Chiết khấu hôm nay" value={formatVnd(wallet?.todayCommission ?? '0')} />
        <StatCard label="Bậc chiết khấu" value={wallet?.discountTier ?? 'STANDARD'} />
        <StatCard
          label="Cập nhật lần cuối"
          value={wallet?.lastUpdated ? formatDateTime(wallet.lastUpdated) : '—'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Xu hướng số dư — 7 ngày</p>
          <TrendBars points={wallet?.balanceTrend7 ?? []} />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Xu hướng số dư — 30 ngày</p>
          <TrendBars points={wallet?.balanceTrend30 ?? []} />
        </div>
      </div>
    </div>
  );
}
