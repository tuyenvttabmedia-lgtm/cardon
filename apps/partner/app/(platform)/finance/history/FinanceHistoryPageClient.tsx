'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Label } from '@/components/ui/Input';
import { FinancePageShell } from '@/components/finance/FinanceSubNav';
import { EnterpriseModuleBanner } from '@/components/platform/EnterpriseModuleBanner';
import { FINANCE_HISTORY_CATEGORIES } from '@/lib/finance/constants';
import { financeApi } from '@/services/api-client';
import { formatDateTime, formatVnd } from '@/lib/utils';
import type { FinanceHistoryEntry, FinanceHistoryFilters } from '@/types/platform';

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  FINANCE_HISTORY_CATEGORIES.filter((c) => c.value).map((c) => [c.value, c.label]),
);

export default function FinanceHistoryPageClient() {
  const [filters, setFilters] = useState<FinanceHistoryFilters>({ skip: 0, take: 25 });
  const [items, setItems] = useState<FinanceHistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await financeApi.listHistory(filters);
      setItems(res.items);
      setTotal(res.total);
      void financeApi.audit('filter', { page: 'history', filters });
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const take = filters.take ?? 25;
  const skip = filters.skip ?? 0;

  return (
    <FinancePageShell title="Lịch sử tài chính" description="Timeline gộp nạp, rút, mua hàng, hoàn tiền, điều chỉnh, đối soát và chiết khấu.">
      <EnterpriseModuleBanner />
      <Card className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <Label htmlFor="dateFrom">Từ ngày</Label>
            <Input
              id="dateFrom"
              type="date"
              className="mt-1"
              value={filters.dateFrom ?? ''}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value || undefined, skip: 0 })}
            />
          </div>
          <div>
            <Label htmlFor="dateTo">Đến ngày</Label>
            <Input
              id="dateTo"
              type="date"
              className="mt-1"
              value={filters.dateTo ?? ''}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value || undefined, skip: 0 })}
            />
          </div>
          <div>
            <Label htmlFor="category">Loại</Label>
            <select
              id="category"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={filters.category ?? ''}
              onChange={(e) => setFilters({ ...filters, category: e.target.value || undefined, skip: 0 })}
            >
              {FINANCE_HISTORY_CATEGORIES.map((c) => (
                <option key={c.value || 'all'} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="search">Tìm kiếm</Label>
            <Input
              id="search"
              className="mt-1"
              placeholder="Mã tham chiếu, đơn hàng..."
              value={filters.search ?? ''}
              onChange={(e) => setFilters({ ...filters, search: e.target.value || undefined, skip: 0 })}
            />
          </div>
        </div>
        <Button size="sm" onClick={() => void load()}>
          Áp dụng bộ lọc
        </Button>
      </Card>

      <div className="relative space-y-0">
        {loading ? (
          <p className="text-sm text-slate-500">Đang tải...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">Không có bản ghi phù hợp.</p>
        ) : (
          items.map((entry, i) => (
            <div key={entry.id} className="relative flex gap-4 pb-6">
              {i < items.length - 1 && (
                <span className="absolute left-[7px] top-4 h-full w-px bg-slate-200" aria-hidden />
              )}
              <span className="relative z-10 mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-indigo-500 bg-white" />
              <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">
                    {CATEGORY_LABELS[entry.category] ?? entry.type}
                  </span>
                  <span className="text-sm font-medium text-indigo-600">{formatVnd(entry.amount)}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{formatDateTime(entry.time)}</p>
                <p className="mt-2 text-sm text-slate-600">{entry.description}</p>
                {entry.referenceNo && (
                  <p className="mt-1 font-mono text-xs text-slate-400">{entry.referenceNo}</p>
                )}
              </div>
            </div>
          ))
        )}
      </div>

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
              onClick={() => setFilters({ ...filters, skip: Math.max(0, skip - take) })}
            >
              Trước
            </button>
            <button
              type="button"
              disabled={skip + take >= total}
              className="rounded border px-3 py-1 disabled:opacity-40"
              onClick={() => setFilters({ ...filters, skip: skip + take })}
            >
              Sau
            </button>
          </div>
        </div>
      )}
    </FinancePageShell>
  );
}
