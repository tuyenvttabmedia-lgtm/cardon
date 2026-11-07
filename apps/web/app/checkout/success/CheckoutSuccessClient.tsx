'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useT } from '@/components/i18n/LocaleProvider';
import { customerFacingError } from '@/lib/i18n/customer-error';
import { PageContainer } from '@/components/layout/PageContainer';
import { OrderDeliveryContent } from '@/components/order/OrderDeliveryContent';
import { useAuth } from '@/hooks/useAuth';
import { orderApi } from '@/services/api-client';
import type { OrderDeliveryResponse } from '@/types/api';

export default function CheckoutSuccessPageClient() {
  const searchParams = useSearchParams();
  const orderCode = searchParams.get('orderCode');
  const email = searchParams.get('email');
  const { isAuthenticated, loading: authLoading } = useAuth();
  const t = useT();
  const { locale } = useLocale();
  const [delivery, setDelivery] = useState<OrderDeliveryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!orderCode) {
      setLoading(false);
      return;
    }

    const resolvedOrderCode = orderCode;
    let active = true;

    async function load() {
      try {
        let data: OrderDeliveryResponse | null = null;

        if (isAuthenticated) {
          const orders = await orderApi.list();
          const found = orders.find((o) => o.orderCode === resolvedOrderCode);
          if (found) {
            data = await orderApi.getDelivery(found.id);
          }
        } else if (email) {
          data = await orderApi.lookupDelivery(resolvedOrderCode, email);
        }

        if (active) {
          if (data) {
            setDelivery(data);
            setError(null);
          } else {
            setError(t('order.notFound'));
          }
        }
      } catch (err) {
        if (active) {
          setError(customerFacingError(locale, err));
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    const timer = setInterval(() => void load(), 8000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [orderCode, email, isAuthenticated, authLoading, locale, t]);

  if (!orderCode || (!isAuthenticated && !email)) {
    return (
      <PageContainer>
        <p className="text-cardon-gray">{t('pay.missing')}</p>
      </PageContainer>
    );
  }

  if (authLoading || (loading && !delivery)) {
    return (
      <PageContainer>
        <p className="text-cardon-gray">{t('order.loading')}</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="page-footer-gap">
      {error && !delivery && <p className="text-red-600">{error}</p>}
      {delivery && (
        <OrderDeliveryContent
          delivery={delivery}
          orderId={delivery.order.id}
          paymentStatus={
            delivery.order.paymentStatus === 'PAID' ? 'success' : delivery.order.paymentStatus
          }
          guestEmail={!isAuthenticated && email ? email : undefined}
          backHref={isAuthenticated ? '/tai-khoan/lich-su-giao-dich' : '/'}
          backLabel={isAuthenticated ? `← ${t('order.backHistory')}` : `← ${t('common.backHome')}`}
        />
      )}
    </PageContainer>
  );
}
