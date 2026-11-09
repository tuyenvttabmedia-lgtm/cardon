'use client';

import { Badge, statusTone } from '@/components/ui/Display';
import { Button } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';
import { cn, formatDateTime } from '@/lib/utils';
import type { AdminCustomer } from '@/types/api';

export function CustomersListPanel({
  items,
  total,
  skip,
  take,
  selectedId,
  loading,
  onSelect,
  onPageChange,
  onTakeChange,
}: {
  items: AdminCustomer[];
  total: number;
  skip: number;
  take: number;
  selectedId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onPageChange: (nextSkip: number) => void;
  onTakeChange: (take: number) => void;
}) {
  const page = Math.floor(skip / take) + 1;
  const pages = Math.max(1, Math.ceil(total / take));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {loading && items.length === 0 ? (
          <p className="p-3 text-sm text-slate-500">{vi.customers.loading}</p>
        ) : null}
        {!loading && items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">
            {vi.customers.emptyList}
          </p>
        ) : null}
        {items.map((customer) => {
          const selected = customer.id === selectedId;
          const displayName = customer.fullName || customer.username || '—';
          return (
            <button
              key={customer.id}
              type="button"
              onClick={() => onSelect(customer.id)}
              className={cn(
                'w-full rounded-lg border px-3 py-2.5 text-left transition',
                selected
                  ? 'border-admin-300 bg-admin-50 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-admin-200 hover:bg-slate-50',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{customer.email}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-600">{displayName}</p>
                  {customer.phone ? (
                    <p className="mt-0.5 truncate text-xs text-slate-500">{customer.phone}</p>
                  ) : null}
                </div>
                <Badge tone={statusTone(customer.status)} status={customer.status} />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
                <span>
                  {vi.customers.createdAt}: {formatDateTime(customer.createdAt)}
                </span>
                <span>
                  {vi.customers.lastLogin}:{' '}
                  {customer.lastLoginAt ? formatDateTime(customer.lastLoginAt) : '—'}
                </span>
              </div>
              <p className="mt-1 truncate font-mono text-[10px] text-slate-300">{customer.id}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-sm">
        <label className="inline-flex items-center gap-2 text-slate-600">
          <span>{vi.customers.ordersPerPage}</span>
          <select
            value={take}
            onChange={(e) => onTakeChange(Number(e.target.value))}
            className="rounded border border-slate-200 px-2 py-1"
          >
            {[25, 50].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={skip === 0 || loading}
            onClick={() => onPageChange(Math.max(0, skip - take))}
          >
            {vi.customers.prevPage}
          </Button>
          <span className="text-slate-600">
            {vi.customers.pageOf} {page}/{pages} ({total})
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={skip + take >= total || loading}
            onClick={() => onPageChange(skip + take)}
          >
            {vi.customers.nextPage}
          </Button>
        </div>
      </div>
    </div>
  );
}
