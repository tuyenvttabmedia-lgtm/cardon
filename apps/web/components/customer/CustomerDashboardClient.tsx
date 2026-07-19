'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CustomerEmptyState, CustomerPageHeader, CustomerSkeleton, CustomerStatCard } from '@/components/customer/CustomerUi';
import { customerCenterApi } from '@/lib/customer-portal/api';
import { formatVnd } from '@/lib/utils';

export default function CustomerDashboardClient() {
  const [data, setData] = useState<Awaited<ReturnType<typeof customerCenterApi.getDashboard>> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void customerCenterApi
      .getDashboard()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <CustomerSkeleton rows={4} />;

  if (!data) {
    return <CustomerEmptyState message="Không thể tải bảng điều khiển. Vui lòng thử lại sau." />;
  }

  const { cards, recent } = data;

  return (
    <div className="space-y-8">
      <CustomerPageHeader
        title="Bảng điều khiển"
        description="Tổng quan đơn hàng, PIN và thông báo của bạn."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <CustomerStatCard label="Đơn hàng hôm nay" value={cards.ordersToday} />
        <CustomerStatCard label="Đơn thành công" value={cards.successToday} />
        <CustomerStatCard label="Đơn đang xử lý" value={cards.processingToday} />
        <CustomerStatCard label="Kho PIN" value={cards.pinCount} />
        <CustomerStatCard label="Thông báo" value={cards.unreadNotifications} />
        <CustomerStatCard
          label="Lần đăng nhập gần nhất"
          value={
            cards.lastLoginAt
              ? new Date(cards.lastLoginAt).toLocaleString('vi-VN')
              : '—'
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 dark:text-white">Đơn hàng gần đây</h2>
            <Link href="/orders" className="text-sm text-sky-600 hover:underline">
              Xem tất cả
            </Link>
          </div>
          {recent.orders.length === 0 ? (
            <p className="text-sm text-slate-500">Chưa có đơn hàng.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {recent.orders.map((o) => (
                <li key={o.id} className="flex justify-between gap-2 border-b border-slate-100 pb-2 dark:border-slate-700">
                  <Link href={`/orders/${o.id}`} className="font-medium text-sky-600 hover:underline">
                    {o.orderCode}
                  </Link>
                  <span>{formatVnd(o.totalAmount)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 dark:text-white">PIN gần đây</h2>
            <Link href="/pins" className="text-sm text-sky-600 hover:underline">
              Kho PIN
            </Link>
          </div>
          {recent.pins.length === 0 ? (
            <p className="text-sm text-slate-500">Chưa có PIN.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {recent.pins.map((p) => (
                <li key={p.cardId} className="border-b border-slate-100 pb-2 dark:border-slate-700">
                  <p className="font-medium">{p.productName}</p>
                  <p className="font-mono text-xs text-slate-500">{p.serial}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 dark:text-white">Thông báo</h2>
            <Link href="/notifications" className="text-sm text-sky-600 hover:underline">
              Xem tất cả
            </Link>
          </div>
          {recent.notifications.length === 0 ? (
            <p className="text-sm text-slate-500">Không có thông báo.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {recent.notifications.map((n) => (
                <li key={n.id} className="border-b border-slate-100 pb-2 dark:border-slate-700">
                  <p className="font-medium">{n.title}</p>
                  <p className="text-xs text-slate-500">{n.body}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
