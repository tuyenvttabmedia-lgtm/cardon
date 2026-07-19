'use client';

import Link from 'next/link';
import { CardDeliveryPanel } from '@/components/order/CardDeliveryPanel';
import { OrderStatusPanel } from '@/components/order/OrderStatusPanel';
import { OrderTimeline } from '@/components/order/OrderTimeline';
import type { OrderDeliveryResponse } from '@/types/api';

export function OrderDeliveryContent({
  delivery,
  orderId,
  paymentStatus,
  guestEmail,
  backHref,
  backLabel = '← Quay lại',
  showCardsOnly = false,
}: {
  delivery: OrderDeliveryResponse;
  orderId: string;
  paymentStatus?: string | null;
  guestEmail?: string;
  backHref?: string;
  backLabel?: string;
  showCardsOnly?: boolean;
}) {
  const { order, timeline, delivery: deliveryInfo } = delivery;

  return (
    <div className="w-full space-y-6">
      {paymentStatus === 'success' && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          Thanh toán thành công. Đơn hàng sẽ tự cập nhật khi hoàn tất.
        </div>
      )}

      {!showCardsOnly && (
        <>
          <div>
            <p className="text-sm text-cardon-gray">Đơn hàng</p>
            <h1 className="text-2xl font-bold text-cardon-navy sm:text-3xl">{order.orderCode}</h1>
          </div>

          <OrderStatusPanel order={order} />
          <OrderTimeline steps={timeline} />
        </>
      )}

      {deliveryInfo.hasCards && deliveryInfo.cards.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-cardon-navy">Thẻ của bạn</h2>
          <div className="mt-4">
            <CardDeliveryPanel
              orderId={orderId}
              cards={deliveryInfo.cards}
              guestEmail={guestEmail}
            />
          </div>
        </div>
      )}

      {!showCardsOnly &&
        order.customerStatus !== 'DELIVERED' &&
        !deliveryInfo.hasCards && (
          <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
            Đơn hàng đang được xử lý. Trang sẽ tự cập nhật khi hoàn tất.
          </p>
        )}

      {backHref && (
        <Link href={backHref} className="inline-block text-sm font-semibold text-cardon-blue hover:underline">
          {backLabel}
        </Link>
      )}
    </div>
  );
}
