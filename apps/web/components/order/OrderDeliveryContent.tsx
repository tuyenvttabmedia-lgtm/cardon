'use client';

import Link from 'next/link';
import { EsimInstallPanel } from '@/components/esim/EsimInstallPanel';
import { CardDeliveryPanel } from '@/components/order/CardDeliveryPanel';
import { OrderStatusPanel } from '@/components/order/OrderStatusPanel';
import { OrderTimeline } from '@/components/order/OrderTimeline';
import { buildCheckoutPayPath } from '@/lib/checkout-qr-flow';
import type { EsimDelivery, OrderDeliveryResponse } from '@/types/api';

export function OrderDeliveryContent({
  delivery,
  orderId,
  paymentStatus,
  guestEmail,
  backHref,
  backLabel = '← Quay lại',
  showCardsOnly = false,
  syncingPayment,
}: {
  delivery: OrderDeliveryResponse;
  orderId: string;
  paymentStatus?: string | null;
  guestEmail?: string;
  backHref?: string;
  backLabel?: string;
  showCardsOnly?: boolean;
  syncingPayment?: boolean;
}) {
  const { order, timeline, delivery: deliveryInfo } = delivery;
  const paid = order.paymentStatus === 'PAID';
  const esim = resolveEsimDelivery(deliveryInfo.esim, {
    orderCode: order.orderCode,
    orderId,
  });
  const isEsim = esim.kind !== 'none';

  return (
    <div className="w-full space-y-6">
      {syncingPayment && !paid && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Đang xác nhận thanh toán với SePay rồi lấy mã eSIM. Trang này tự cập nhật.
        </div>
      )}
      {paid && paymentStatus === 'success' && esim.kind === 'waiting' && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          Thanh toán đã xác nhận. Đang lấy mã cài eSIM.
        </div>
      )}

      {order.paymentStatus === 'WAITING_PAYMENT' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p>
            Đơn chưa nhận được xác nhận thanh toán từ cổng. Giữ trang QR SePay và chuyển đúng số tiền
            — hệ thống sẽ cập nhật khi nhận được notify.
          </p>
          <Link
            href={buildCheckoutPayPath({
              orderId,
              orderCode: order.orderCode,
              email: order.guestEmail || guestEmail || '',
            })}
            className="mt-2 inline-block font-semibold text-cardon-blue hover:underline"
          >
            Mở lại trang thanh toán QR
          </Link>
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

      {isEsim ? (
        <EsimInstallPanel esim={esim} compact={showCardsOnly} guestEmail={guestEmail} />
      ) : null}

      {!showCardsOnly &&
        order.customerStatus !== 'DELIVERED' &&
        !deliveryInfo.hasCards &&
        !isEsim && (
          <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
            {paid
              ? 'Đơn đã thanh toán. Hệ thống đang xử lý — trang sẽ tự cập nhật.'
              : 'Đơn chưa thanh toán. Giữ trang QR và chuyển đúng số tiền — trang sẽ tự cập nhật.'}
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

function resolveEsimDelivery(
  esim: EsimDelivery | undefined,
  fallback: {
    orderCode: string;
    orderId: string;
  },
): EsimDelivery {
  if (esim && esim.kind !== 'none') {
    return {
      ...esim,
      orderCode: esim.orderCode ?? fallback.orderCode,
      orderId: esim.orderId ?? fallback.orderId,
      installSecret: null,
      qrSvg: null,
      appleSetupUrl: null,
    };
  }
  return {
    kind: 'none',
    destination: 'điểm đến',
    packageName: null,
    testData: false,
    sandboxAccount: false,
    notice: null,
    installSecret: null,
    qrSvg: null,
    appleSetupUrl: null,
    canRevealInstallSecret: false,
    packageSpec: null,
    orderCode: fallback.orderCode,
    orderId: fallback.orderId,
  };
}
