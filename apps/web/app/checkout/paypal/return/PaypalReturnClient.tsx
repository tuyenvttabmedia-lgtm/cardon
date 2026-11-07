'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useT } from '@/components/i18n/LocaleProvider';
import { PageContainer } from '@/components/layout/PageContainer';
import { paypalReturnCopyKey, paypalReturnPresentation, type PaypalReturnView } from '@/lib/esim-paypal';
import { withLocalePrefix } from '@/lib/i18n/locale';
import { paymentApi } from '@/services/api-client';

/**
 * PayPal return / cancel page.
 * Query flags from PayPal are not payment confirmation. Only POST /payments/orders/:id/sync is.
 */
export default function PaypalReturnClient({ cancelled }: { cancelled: boolean }) {
  const t = useT();
  const { locale } = useLocale();
  const params = useSearchParams();
  const orderId = params.get('orderId') ?? '';
  const [view, setView] = useState<PaypalReturnView>(cancelled ? 'cancelled' : 'unconfirmed');

  useEffect(() => {
    if (!orderId) return;
    let active = true;
    paymentApi
      .syncFromGateway(orderId)
      .then((result) => {
        if (!active) return;
        setView(paypalReturnPresentation({ backendStatus: result.status, cancelled }));
      })
      .catch(() => {
        if (!active) return;
        setView(paypalReturnPresentation({ backendStatus: null, cancelled }));
      });
    return () => {
      active = false;
    };
  }, [orderId, cancelled]);

  const orderHref = orderId ? withLocalePrefix(`/orders/${orderId}`, locale) : null;
  const homeHref = withLocalePrefix('/', locale);

  return (
    <PageContainer>
      <div className="mx-auto max-w-lg rounded-2xl border border-cardon-border bg-white p-6">
        <h1 className="text-2xl font-bold text-cardon-navy">
          {view === 'cancelled' ? t('paypal.cancelledTitle') : t('paypal.returnTitle')}
        </h1>
        <p className="mt-3 text-cardon-gray">{t(paypalReturnCopyKey(view))}</p>
        {view === 'confirmed' && orderHref ? (
          <div className="mt-6">
            <Link href={orderHref} className="text-sm font-semibold text-cardon-blue hover:underline">
              {t('result.viewOrder')}
            </Link>
          </div>
        ) : null}
        {(view === 'cancelled' || view === 'failed') && (
          <div className="mt-6">
            <Link href={homeHref} className="btn-checkout !w-auto px-5">
              {t('result.newOrder')}
            </Link>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
