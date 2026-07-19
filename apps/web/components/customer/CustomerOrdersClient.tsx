'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CustomerEmptyState, CustomerPageHeader, CustomerSkeleton } from '@/components/customer/CustomerUi';
import { orderDetailHref } from '@/lib/account-routes';
import { customerCenterApi, type CustomerOrderRow } from '@/lib/customer-portal/api';
import { paymentStatusLabelVi, resolveCustomerOrderStatusLabel } from '@/lib/order-labels';
import { cn, formatVnd } from '@/lib/utils';

const TABS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'processing', label: 'Đang xử lý' },
  { id: 'completed', label: 'Hoàn thành' },
] as const;

function exportCsv(rows: CustomerOrderRow[]) {
  const header = 'Mã đơn,Trạng thái,Thanh toán,Số tiền,Ngày\n';
  const body = rows
    .map(
      (o) =>
        `${o.orderCode},${resolveCustomerOrderStatusLabel(o)},${paymentStatusLabelVi(o.paymentStatus)},${o.totalAmount},${o.createdAt}`,
    )
    .join('\n');
  const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `don-hang-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CustomerOrdersClient() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('all');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [skip, setSkip] = useState(0);
  const take = 15;
  const [items, setItems] = useState<CustomerOrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    void customerCenterApi
      .listOrders({ tab, q: search || undefined, skip, take })
      .then((r) => {
        setItems(r.items);
        setTotal(r.total);
      })
      .catch(() => {
        setItems([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [tab, search, skip]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / take));
  const page = Math.floor(skip / take) + 1;

  return (
    <div>
      <CustomerPageHeader title="Đơn hàng" description="Quản lý và tra cứu đơn hàng của bạn." />

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setSkip(0);
            }}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium',
              tab === t.id ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          placeholder="Mã đơn, mã thanh toán…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setSearch(q);
            setSkip(0);
          }}
        >
          Tìm kiếm
        </Button>
        <Button type="button" variant="ghost" onClick={() => exportCsv(items)} disabled={items.length === 0}>
          Xuất CSV
        </Button>
      </div>

      {loading ? (
        <CustomerSkeleton rows={5} />
      ) : items.length === 0 ? (
        <CustomerEmptyState message="Không có đơn hàng phù hợp." />
      ) : (
        <div className="space-y-3">
          {items.map((o) => (
            <div
              key={o.id}
              className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <Link href={orderDetailHref(o.id, 'orders')} className="font-semibold text-sky-600 hover:underline">
                  {o.orderCode}
                </Link>
                <span className="font-bold">{formatVnd(o.totalAmount)}</span>
              </div>
              <p className="mt-1 text-slate-600 dark:text-slate-300">
                {o.items.map((i) => i.productName).join(', ')}
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700">
                  {paymentStatusLabelVi(o.paymentStatus)}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                  {resolveCustomerOrderStatusLabel(o)}
                </span>
                {o.paymentGateway && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                    {o.paymentGateway}
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs text-slate-500">{new Date(o.createdAt).toLocaleString('vi-VN')}</p>
              <Link href={orderDetailHref(o.id, 'orders')} className="mt-2 inline-block text-xs font-semibold text-sky-600">
                Chi tiết →
              </Link>
            </div>
          ))}
        </div>
      )}

      {total > take && (
        <div className="mt-6 flex items-center justify-between text-sm">
          <Button type="button" variant="ghost" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - take))}>
            Trang trước
          </Button>
          <span>
            Trang {page}/{totalPages} ({total} đơn)
          </span>
          <Button
            type="button"
            variant="ghost"
            disabled={skip + take >= total}
            onClick={() => setSkip(skip + take)}
          >
            Trang sau
          </Button>
        </div>
      )}
    </div>
  );
}
