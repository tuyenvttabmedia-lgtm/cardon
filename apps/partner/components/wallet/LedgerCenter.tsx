'use client';

import { useState } from 'react';
import { Badge, statusToBadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Label } from '@/components/ui/Input';
import { formatDateTime, formatVnd } from '@/lib/utils';
import type { WalletLedgerEntry, WalletLedgerFilters } from '@/types/platform';
import { PORTAL_LEDGER_TYPES } from '@/lib/wallet/constants';

export function LedgerFiltersBar({
  filters,
  onChange,
  onSearch,
  onExport,
  canExport,
}: {
  filters: WalletLedgerFilters;
  onChange: (next: WalletLedgerFilters) => void;
  onSearch: () => void;
  onExport: (format: 'csv' | 'excel' | 'pdf') => void;
  canExport: boolean;
}) {
  return (
    <Card className="sticky top-0 z-10 space-y-4 bg-white/95 backdrop-blur">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <Label htmlFor="dateFrom">Từ ngày</Label>
          <Input
            id="dateFrom"
            type="date"
            className="mt-1"
            value={filters.dateFrom ?? ''}
            onChange={(e) => onChange({ ...filters, dateFrom: e.target.value || undefined })}
          />
        </div>
        <div>
          <Label htmlFor="dateTo">Đến ngày</Label>
          <Input
            id="dateTo"
            type="date"
            className="mt-1"
            value={filters.dateTo ?? ''}
            onChange={(e) => onChange({ ...filters, dateTo: e.target.value || undefined })}
          />
        </div>
        <div>
          <Label htmlFor="type">Loại</Label>
          <select
            id="type"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={filters.type ?? ''}
            onChange={(e) => onChange({ ...filters, type: e.target.value || undefined })}
          >
            <option value="">Tất cả loại</option>
            {PORTAL_LEDGER_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="search">Tìm kiếm</Label>
          <Input
            id="search"
            className="mt-1"
            placeholder="Mã tham chiếu, đơn hàng, mô tả..."
            value={filters.search ?? ''}
            onChange={(e) => onChange({ ...filters, search: e.target.value || undefined })}
          />
        </div>
        <div>
          <Label htmlFor="orderId">Mã đơn</Label>
          <Input
            id="orderId"
            className="mt-1"
            value={filters.orderId ?? ''}
            onChange={(e) => onChange({ ...filters, orderId: e.target.value || undefined })}
          />
        </div>
        <div>
          <Label htmlFor="reference">Mã tham chiếu</Label>
          <Input
            id="reference"
            className="mt-1"
            value={filters.reference ?? ''}
            onChange={(e) => onChange({ ...filters, reference: e.target.value || undefined })}
          />
        </div>
        <div>
          <Label htmlFor="amountMin">Số tiền tối thiểu</Label>
          <Input
            id="amountMin"
            type="number"
            className="mt-1"
            value={filters.amountMin ?? ''}
            onChange={(e) => onChange({ ...filters, amountMin: e.target.value || undefined })}
          />
        </div>
        <div>
          <Label htmlFor="amountMax">Số tiền tối đa</Label>
          <Input
            id="amountMax"
            type="number"
            className="mt-1"
            value={filters.amountMax ?? ''}
            onChange={(e) => onChange({ ...filters, amountMax: e.target.value || undefined })}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onSearch}>
          Áp dụng bộ lọc
        </Button>
        {canExport && (
          <>
            <Button size="sm" variant="secondary" onClick={() => onExport('csv')}>
              Xuất CSV
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onExport('excel')}>
              Xuất Excel
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onExport('pdf')}>
              Xuất PDF
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

export function LedgerTable({
  items,
  loading,
  onSelect,
}: {
  items: WalletLedgerEntry[];
  loading: boolean;
  onSelect: (entry: WalletLedgerEntry) => void;
}) {
  if (loading) return <p className="text-sm text-slate-500">Đang tải sổ quỹ...</p>;
  if (!items.length) return <p className="text-sm text-slate-500">Không tìm thấy bút toán.</p>;

  return (
    <Card className="overflow-x-auto p-0">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-4 py-3">Thời gian</th>
            <th className="px-4 py-3">Mã tham chiếu</th>
            <th className="px-4 py-3">Mã đơn</th>
            <th className="px-4 py-3">Loại</th>
            <th className="px-4 py-3">Mô tả</th>
            <th className="px-4 py-3">Số tiền</th>
            <th className="px-4 py-3">Số dư trước</th>
            <th className="px-4 py-3">Số dư sau</th>
            <th className="px-4 py-3">Người thực hiện</th>
            <th className="px-4 py-3">Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {items.map((entry) => (
            <tr
              key={entry.id}
              className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
              onClick={() => onSelect(entry)}
            >
              <td className="whitespace-nowrap px-4 py-3">{formatDateTime(entry.time)}</td>
              <td className="max-w-[120px] truncate px-4 py-3 font-mono text-xs">{entry.referenceNo}</td>
              <td className="max-w-[120px] truncate px-4 py-3 font-mono text-xs">{entry.orderId ?? '—'}</td>
              <td className="px-4 py-3">
                <Badge tone={statusToBadgeTone(entry.status)}>{entry.type}</Badge>
              </td>
              <td className="max-w-[200px] truncate px-4 py-3">{entry.description}</td>
              <td className="whitespace-nowrap px-4 py-3">{formatVnd(entry.amount)}</td>
              <td className="whitespace-nowrap px-4 py-3">{formatVnd(entry.balanceBefore)}</td>
              <td className="whitespace-nowrap px-4 py-3">{formatVnd(entry.balanceAfter)}</td>
              <td className="px-4 py-3">{entry.operator ?? '—'}</td>
              <td className="px-4 py-3">{entry.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function LedgerDetailDrawer({
  detail,
  open,
  onClose,
}: {
  detail: Record<string, unknown> | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!open || !detail) return null;

  const timeline = (detail.auditTrail as Array<{ at: string; type: string; amount: string; status: string }>) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Transaction Detail</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <dl className="mt-6 space-y-3 text-sm">
          <div>
            <dt className="text-slate-500">Type</dt>
            <dd className="font-medium">{String(detail.type)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Reference</dt>
            <dd className="font-mono text-xs">{String(detail.referenceNo)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Amount</dt>
            <dd>{formatVnd(String(detail.amount))}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Balance Before → After</dt>
            <dd>
              {formatVnd(String(detail.balanceBefore))} → {formatVnd(String(detail.balanceAfter))}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Description</dt>
            <dd>{String(detail.description ?? '—')}</dd>
          </div>
        </dl>
        {timeline.length > 0 && (
          <div className="mt-8">
            <h3 className="text-sm font-semibold text-slate-900">Audit Trail</h3>
            <ul className="mt-3 space-y-2">
              {timeline.map((t, i) => (
                <li key={i} className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
                  {formatDateTime(t.at)} — {t.type} — {formatVnd(t.amount)} ({t.status})
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
