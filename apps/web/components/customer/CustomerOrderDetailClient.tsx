'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CardDeliveryPanel } from '@/components/order/CardDeliveryPanel';
import { OrderStatusPanel } from '@/components/order/OrderStatusPanel';
import { OrderTimeline } from '@/components/order/OrderTimeline';
import { Button } from '@/components/ui/Button';
import { CustomerEmptyState, CustomerPageHeader, CustomerSkeleton } from '@/components/customer/CustomerUi';
import { ACCOUNT_PATHS } from '@/lib/account-routes';
import { customerCenterApi } from '@/lib/customer-portal/api';
import { paymentStatusLabelVi } from '@/lib/order-labels';
import { formatVnd } from '@/lib/utils';

export default function CustomerOrderDetailClient({ orderId }: { orderId: string }) {
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof customerCenterApi.getOrder>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void customerCenterApi
      .getOrder(orderId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [orderId]);

  async function resendEmail() {
    setResending(true);
    setMessage(null);
    try {
      const r = await customerCenterApi.resendEmail(orderId);
      setMessage(r.message);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Gửi email thất bại');
    } finally {
      setResending(false);
    }
  }

  if (loading) return <CustomerSkeleton rows={4} />;
  if (!detail) return <CustomerEmptyState message="Không tìm thấy đơn hàng." />;

  const { order, timeline, delivery, payment, product, emailHistory, gateway } = detail;

  return (
    <div className="space-y-6">
      <Link href={ACCOUNT_PATHS.orders} className="text-sm text-sky-600 hover:underline">
        ← Quay lại danh sách
      </Link>
      <CustomerPageHeader title={`Đơn ${order.orderCode}`} description="Chi tiết đơn hàng và giao PIN." />

      <OrderStatusPanel order={order} />

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <h2 className="font-semibold">Thông tin thanh toán</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Trạng thái</dt>
              <dd>{paymentStatusLabelVi(order.paymentStatus)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Gateway</dt>
              <dd>{gateway ?? payment?.gateway ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Mã thanh toán</dt>
              <dd className="font-mono text-xs">{payment?.reference ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Số tiền</dt>
              <dd className="font-semibold">{formatVnd(order.totalAmount)}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <h2 className="font-semibold">Sản phẩm</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {product.map((p, i) => (
              <li key={i}>
                {p.name} — {p.variant} ×{p.quantity}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="font-semibold">Timeline</h2>
        <div className="mt-4">
          <OrderTimeline steps={timeline} />
        </div>
      </section>

      {delivery.hasCards && delivery.cards.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <h2 className="mb-4 font-semibold">Mã PIN</h2>
          <CardDeliveryPanel orderId={order.id} cards={delivery.cards} />
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Email giao PIN</h2>
          <Button type="button" size="sm" disabled={resending} onClick={() => void resendEmail()}>
            {resending ? 'Đang gửi…' : 'Gửi lại email PIN'}
          </Button>
        </div>
        {message && <p className="mt-2 text-sm text-slate-600">{message}</p>}
        {emailHistory.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Chưa có lịch sử gửi email.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {emailHistory.map((e, i) => (
              <li key={i} className="text-slate-600">
                {new Date(e.at).toLocaleString('vi-VN')} — {e.message}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
