'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { FinancePageShell } from '@/components/finance/FinanceSubNav';
import { EnterpriseModuleBanner } from '@/components/platform/EnterpriseModuleBanner';
import { FINANCE_ADJUSTMENT_LABELS } from '@/lib/finance/constants';
import { financeApi } from '@/services/api-client';
import { formatDateTime, formatVnd } from '@/lib/utils';
import type { FinanceAdjustmentRow } from '@/types/platform';

export default function FinanceAdjustmentsPageClient() {
  const [items, setItems] = useState<FinanceAdjustmentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const take = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await financeApi.listAdjustments({ skip, take });
      setItems(res.items);
      setTotal(res.total);
      void financeApi.audit('filter', { page: 'adjustments', skip });
    } finally {
      setLoading(false);
    }
  }, [skip]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <FinancePageShell
      title="Điều chỉnh"
      description="Cộng tiền, trừ tiền, hoàn tiền, chiết khấu và điều chỉnh thủ công — nguồn Sổ quỹ."
    >
      <EnterpriseModuleBanner />
      <Card className="overflow-x-auto p-0">
        {loading ? (
          <p className="p-4 text-sm text-slate-500">Đang tải...</p>
        ) : items.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">Chưa có giao dịch điều chỉnh.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Thời gian</th>
                <th className="px-4 py-3">Mã tham chiếu</th>
                <th className="px-4 py-3">Loại</th>
                <th className="px-4 py-3">Số tiền</th>
                <th className="px-4 py-3">Mô tả</th>
                <th className="px-4 py-3">Người thực hiện</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{formatDateTime(row.time)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.reference}</td>
                  <td className="px-4 py-3">{FINANCE_ADJUSTMENT_LABELS[row.type] ?? row.type}</td>
                  <td className="px-4 py-3">{formatVnd(row.amount)}</td>
                  <td className="px-4 py-3">{row.description}</td>
                  <td className="px-4 py-3">{row.operator ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
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
