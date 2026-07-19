'use client';

import { useEffect, useState } from 'react';
import { StatCard } from '@/components/ui/Card';
import { EnterpriseModuleBanner } from '@/components/platform/EnterpriseModuleBanner';
import { FinancePageShell } from '@/components/finance/FinanceSubNav';
import { financeApi } from '@/services/api-client';
import { formatVnd } from '@/lib/utils';
import type { AgentFinanceOverview } from '@/types/platform';

function CashFlowChart({
  trend7,
  trend30,
}: {
  trend7: Array<{ date: string; balance: string }>;
  trend30: Array<{ date: string; balance: string }>;
}) {
  const [range, setRange] = useState<'7' | '30'>('7');
  const points = range === '7' ? trend7 : trend30;
  const max = Math.max(...points.map((p) => parseFloat(p.balance) || 0), 1);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-900">Biểu đồ dòng tiền</p>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setRange('7')}
            className={`rounded-md px-3 py-1 text-xs font-medium ${range === '7' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600'}`}
          >
            7 ngày
          </button>
          <button
            type="button"
            onClick={() => setRange('30')}
            className={`rounded-md px-3 py-1 text-xs font-medium ${range === '30' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600'}`}
          >
            30 ngày
          </button>
        </div>
      </div>
      <div className="mt-4 flex h-32 items-end gap-1">
        {points.length === 0 ? (
          <p className="text-sm text-slate-400">Chưa có dữ liệu dòng tiền.</p>
        ) : (
          points.map((p) => {
            const h = Math.max(8, (parseFloat(p.balance) / max) * 100);
            return (
              <div key={p.date} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-emerald-500/80"
                  style={{ height: `${h}%` }}
                  title={`${p.date}: ${formatVnd(p.balance)}`}
                />
                <span className="text-[9px] text-slate-400">{p.date.slice(5)}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function FinanceOverviewPageClient() {
  const [data, setData] = useState<AgentFinanceOverview | null>(null);

  useEffect(() => {
    void financeApi.getOverview().then(setData).catch(() => {});
  }, []);

  return (
    <FinancePageShell
      title="Tổng quan tài chính"
      description="Trung tâm quản lý tài chính đại lý — dữ liệu tổng hợp từ Sổ quỹ (Ledger)."
    >
      <EnterpriseModuleBanner />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Số dư khả dụng" value={formatVnd(data?.availableBalance ?? '0')} />
        <StatCard label="Đang đối soát" value={formatVnd(data?.pendingSettlement ?? '0')} />
        <StatCard label="Hạn mức tín dụng" value={formatVnd(data?.creditLimit ?? '0')} />
        <StatCard label="Đã sử dụng" value={formatVnd(data?.creditUsed ?? '0')} />
        <StatCard label="Chờ nạp" value={formatVnd(data?.pendingDeposit ?? '0')} />
        <StatCard label="Chờ rút" value={formatVnd(data?.pendingWithdraw ?? '0')} />
        <StatCard label="Doanh thu hôm nay" value={formatVnd(data?.revenueToday ?? '0')} />
        <StatCard label="Chiết khấu hôm nay" value={formatVnd(data?.discountToday ?? '0')} />
        <StatCard label="Lợi nhuận tháng" value={formatVnd(data?.monthProfit ?? '0')} />
      </div>
      <CashFlowChart trend7={data?.cashFlowTrend7 ?? []} trend30={data?.cashFlowTrend30 ?? []} />
    </FinancePageShell>
  );
}
