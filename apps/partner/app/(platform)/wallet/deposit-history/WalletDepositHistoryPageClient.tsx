'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { DepositStatusBadge } from '@/components/finance/DepositTimeline';
import { WalletPageShell } from '@/components/wallet/WalletSubNav';
import { financeApi } from '@/services/api-client';
import { formatDateTime, formatVnd } from '@/lib/utils';
import type { FinanceDepositRow } from '@/types/platform';

export default function WalletDepositHistoryPageClient() {
  const [items, setItems] = useState<FinanceDepositRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [skip, setSkip] = useState(0);
  const [total, setTotal] = useState(0);
  const take = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await financeApi.listDeposits({ skip, take });
      setItems(res.items);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, [skip]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <WalletPageShell
      title="Lịch sử nạp"
      description="Toàn bộ giao dịch nạp tiền qua cổng thanh toán — dữ liệu từ Sổ quỹ."
    >
      <Card className="overflow-x-auto p-0">
        {loading ? (
          <p className="p-4 text-sm text-slate-500">Đang tải...</p>
        ) : items.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">Chưa có giao dịch nạp tiền.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Mã giao dịch</th>
                <th className="px-4 py-3">Gateway</th>
                <th className="px-4 py-3">Số tiền</th>
                <th className="px-4 py-3">Thực nhận</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3">Thời gian</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-mono text-xs">{row.reference}</td>
                  <td className="px-4 py-3">{row.gateway}</td>
                  <td className="px-4 py-3">{formatVnd(row.amount)}</td>
                  <td className="px-4 py-3">{formatVnd(row.netAmount ?? row.amount)}</td>
                  <td className="px-4 py-3">
                    <DepositStatusBadge label={row.statusLabel ?? row.status} tone={row.statusTone} />
                  </td>
                  <td className="px-4 py-3">{formatDateTime(row.time)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {total > take && (
        <div className="flex justify-between text-sm text-slate-600">
          <span>
            {skip + 1}–{Math.min(skip + take, total)} / {total}
          </span>
          <div className="flex gap-2">
            <button type="button" disabled={skip === 0} className="rounded border px-3 py-1 disabled:opacity-40" onClick={() => setSkip(Math.max(0, skip - take))}>
              Trước
            </button>
            <button type="button" disabled={skip + take >= total} className="rounded border px-3 py-1 disabled:opacity-40" onClick={() => setSkip(skip + take)}>
              Sau
            </button>
          </div>
        </div>
      )}
    </WalletPageShell>
  );
}
