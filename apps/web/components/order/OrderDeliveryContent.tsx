'use client';

import Link from 'next/link';
import { EsimInstallPanel } from '@/components/esim/EsimInstallPanel';
import { CardDeliveryPanel } from '@/components/order/CardDeliveryPanel';
import { OrderStatusPanel } from '@/components/order/OrderStatusPanel';
import { OrderTimeline } from '@/components/order/OrderTimeline';
import { useT } from '@/components/i18n/LocaleProvider';
import { buildCheckoutPayPath } from '@/lib/checkout-qr-flow';
import type { EsimDelivery, OrderDeliveryResponse } from '@/types/api';

export function OrderDeliveryContent({
  delivery,
  orderId,
  paymentStatus,
  guestEmail,
  backHref,
  backLabel,
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
  const t = useT();
  const resolvedBack = backLabel ?? `← ${t('order.back')}`;
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
          {t('order.syncing')}
        </div>
      )}
      {paid && paymentStatus === 'success' && esim.kind === 'waiting' && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          {t('order.esimFetching')}
        </div>
      )}

      {order.paymentStatus === 'WAITING_PAYMENT' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p>
            {t('order.waitingGateway')}
          </p>
          <Link
            href={buildCheckoutPayPath({
              orderId,
              orderCode: order.orderCode,
              email: order.guestEmail || guestEmail || '',
            })}
            className="mt-2 inline-block font-semibold text-cardon-blue hover:underline"
          >
            {t('order.reopenQr')}
          </Link>
        </div>
      )}

      {!showCardsOnly && (
        <>
          <div>
            <p className="text-sm text-cardon-gray">{t('order.order')}</p>
            <h1 className="text-2xl font-bold text-cardon-navy sm:text-3xl">{order.orderCode}</h1>
          </div>

          <OrderStatusPanel order={order} />
          <OrderTimeline steps={timeline} />
        </>
      )}

      {deliveryInfo.hasCards && deliveryInfo.cards.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-cardon-navy">{t('order.yourCards')}</h2>
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
            {paid ? t('order.paidProcessing') : t('order.unpaidHint')}
          </p>
        )}

      {backHref && (
        <Link href={backHref} className="inline-block text-sm font-semibold text-cardon-blue hover:underline">
          {resolvedBack}
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
    destination: '',
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
