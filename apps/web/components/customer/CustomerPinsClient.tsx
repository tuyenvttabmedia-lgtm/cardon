'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CustomerEmptyState, CustomerPageHeader, CustomerSkeleton } from '@/components/customer/CustomerUi';
import { orderDetailHref } from '@/lib/account-routes';
import { customerCenterApi, type CustomerPinRow } from '@/lib/customer-portal/api';
import { orderApi } from '@/services/api-client';

export default function CustomerPinsClient() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [skip, setSkip] = useState(0);
  const take = 20;
  const [items, setItems] = useState<CustomerPinRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    void customerCenterApi
      .listPins({ q: search || undefined, skip, take })
      .then((r) => {
        setItems(r.items);
        setTotal(r.total);
      })
      .catch(() => {
        setItems([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [search, skip]);

  useEffect(() => {
    load();
  }, [load]);

  async function revealPin(row: CustomerPinRow) {
    if (revealed[row.cardId]) return;
    setRevealing(row.cardId);
    try {
      const r = await orderApi.revealPin(row.orderId, row.cardId);
      setRevealed((prev) => ({ ...prev, [row.cardId]: r.pin }));
    } finally {
      setRevealing(null);
    }
  }

  function copy(text: string) {
    void navigator.clipboard.writeText(text);
  }

  function downloadTxt(row: CustomerPinRow) {
    const pin = revealed[row.cardId] ?? '************';
    const content = `Đơn: ${row.orderCode}\nSản phẩm: ${row.productName}\nSerial: ${row.serial}\nPIN: ${pin}\n`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pin-${row.orderCode}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const page = Math.floor(skip / take) + 1;
  const totalPages = Math.max(1, Math.ceil(total / take));

  return (
    <div>
      <CustomerPageHeader
        title="Kho PIN"
        description="Quản lý mã thẻ đã mua. PIN được che cho đến khi bạn xác nhận hiển thị."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Input placeholder="Tìm serial, mã đơn…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
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
      </div>

      {loading ? (
        <CustomerSkeleton rows={4} />
      ) : items.length === 0 ? (
        <CustomerEmptyState message="Chưa có PIN trong kho." />
      ) : (
        <div className="space-y-3">
          {items.map((row) => (
            <div
              key={row.cardId}
              className="rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <p className="font-semibold">{row.productName}</p>
              <p className="text-xs text-slate-500">
                Đơn:{' '}
                <Link href={orderDetailHref(row.orderId, 'cards')} className="text-sky-600 hover:underline">
                  {row.orderCode}
                </Link>
              </p>
              <div className="mt-3 font-mono text-xs">
                <p>
                  Serial: {row.serial}{' '}
                  <button type="button" className="text-sky-600" onClick={() => copy(row.serial)}>
                    Sao chép
                  </button>
                </p>
                <p className="mt-1">
                  PIN: {revealed[row.cardId] ?? '************'}{' '}
                  {!revealed[row.cardId] && (
                    <button
                      type="button"
                      className="text-sky-600"
                      disabled={revealing === row.cardId}
                      onClick={() => void revealPin(row)}
                    >
                      {revealing === row.cardId ? 'Đang tải…' : 'Hiện PIN'}
                    </button>
                  )}
                  {revealed[row.cardId] && (
                    <button type="button" className="ml-2 text-sky-600" onClick={() => copy(revealed[row.cardId])}>
                      Sao chép
                    </button>
                  )}
                </p>
              </div>
              <div className="mt-3 flex gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => downloadTxt(row)}>
                  Tải TXT
                </Button>
              </div>
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
            Trang {page}/{totalPages}
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
