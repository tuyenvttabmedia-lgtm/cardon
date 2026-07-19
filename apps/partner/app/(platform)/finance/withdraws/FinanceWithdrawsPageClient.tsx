'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { FinancePageShell } from '@/components/finance/FinanceSubNav';
import { EnterpriseModuleBanner } from '@/components/platform/EnterpriseModuleBanner';
import { financeApi } from '@/services/api-client';
import { formatDateTime, formatVnd } from '@/lib/utils';
import type { FinanceWithdrawRow } from '@/types/platform';

export default function FinanceWithdrawsPageClient() {
  const [items, setItems] = useState<FinanceWithdrawRow[]>([]);
  const [total, setTotal] = useState(0);
  const [foundation, setFoundation] = useState(false);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const take = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await financeApi.listWithdraws({ skip, take });
      setItems(res.items);
      setTotal(res.total);
      setFoundation(!!res.foundation);
      void financeApi.audit('filter', { page: 'withdraws', skip });
    } finally {
      setLoading(false);
    }
  }, [skip]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <FinancePageShell title="Rút tiền" description="Danh sách rút tiền — chỉ xem, chưa triển khai rút tiền thật.">
      <EnterpriseModuleBanner />
      {foundation && items.length === 0 && !loading ? (
        <Card className="border-dashed border-amber-200 bg-amber-50/50 p-6">
          <p className="font-semibold text-amber-900">Module rút tiền — nền tảng</p>
          <p className="mt-2 text-sm text-amber-800">
            Chưa có giao dịch rút tiền. Yêu cầu rút sẽ hiển thị tại đây khi bật engine rút tiền.
          </p>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          {loading ? (
            <p className="p-4 text-sm text-slate-500">Đang tải...</p>
          ) : items.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">Chưa có giao dịch rút tiền.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3">Mã giao dịch</th>
                  <th className="px-4 py-3">Tài khoản nhận</th>
                  <th className="px-4 py-3">Số tiền</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3">Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-mono text-xs">{row.reference}</td>
                    <td className="px-4 py-3">{row.account}</td>
                    <td className="px-4 py-3">{formatVnd(row.amount)}</td>
                    <td className="px-4 py-3">{row.status}</td>
                    <td className="px-4 py-3">{formatDateTime(row.time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
      {total > take && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            Hiển thị {skip + 1}–{Math.min(skip + take, total)} / {total}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={skip === 0}
              className="rounded border px-3 py-1 disabled:opacity-40"
              onClick={() => setSkip(Math.max(0, skip - take))}
            >
              Trước
            </button>
            <button
              type="button"
              disabled={skip + take >= total}
              className="rounded border px-3 py-1 disabled:opacity-40"
              onClick={() => setSkip(skip + take)}
            >
              Sau
            </button>
          </div>
        </div>
      )}
    </FinancePageShell>
  );
}
