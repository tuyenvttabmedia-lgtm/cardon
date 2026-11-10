'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PageContainer } from '@/components/layout/PageContainer';
import { OrderDeliveryContent } from '@/components/order/OrderDeliveryContent';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useLocale, useT } from '@/components/i18n/LocaleProvider';
import { customerFacingError } from '@/lib/i18n/customer-error';
import { ApiClientError, orderApi } from '@/services/api-client';
import type { OrderDeliveryResponse } from '@/types/api';

export default function GuestOrderLookupPage() {
  const t = useT();
  const { locale } = useLocale();
  const [orderCode, setOrderCode] = useState('');
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<OrderDeliveryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLookup(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await orderApi.lookupDelivery(orderCode.trim(), email.trim());
      setResult(data);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 404) {
        setError(t('order.lookupNotFound'));
      } else {
        setError(customerFacingError(locale, err) || t('order.lookupFail'));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageContainer className="page-footer-gap">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <p className="text-sm text-cardon-gray">
            <Link href="/" className="text-cardon-blue hover:underline">
              {t('nav.home')}
            </Link>
            {' / '}
            {t('order.lookupTitle')}
          </p>
          <h1 className="mt-2 text-2xl font-bold text-cardon-navy sm:text-3xl">
            {t('order.lookupTitle')}
          </h1>
          <p className="mt-2 text-sm text-cardon-gray">{t('order.lookupHint')}</p>
        </div>

        <form
          onSubmit={handleLookup}
          className="rounded-2xl border border-cardon-border bg-white p-4 shadow-card sm:p-6"
        >
          <label className="block text-sm font-medium text-cardon-navy">
            {t('order.lookupCode')}
            <Input
              className="mt-1"
              value={orderCode}
              onChange={(e) => setOrderCode(e.target.value)}
              placeholder="ORD-20260721-A1B2C3"
              autoComplete="off"
              required
            />
          </label>
          <label className="mt-4 block text-sm font-medium text-cardon-navy">
            {t('order.lookupEmail')}
            <Input
              className="mt-1"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              autoComplete="email"
              required
            />
          </label>
          <Button className="btn-checkout mt-5 w-full" type="submit" disabled={loading} size="lg">
            {loading ? t('order.lookupLoading') : t('order.lookupSubmit')}
          </Button>
          {error && (
            <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
          <p className="mt-4 text-sm text-cardon-gray">
            {t('order.lookupHasAccount')}{' '}
            <Link href="/login" className="font-semibold text-cardon-blue hover:underline">
              {t('nav.login')}
            </Link>{' '}
            {t('order.lookupAccountHint')}
          </p>
        </form>

        {result && (
          <div className="rounded-2xl border border-cardon-border bg-white p-4 shadow-card sm:p-6">
            <OrderDeliveryContent
              delivery={result}
              orderId={result.order.id}
              guestEmail={email.trim()}
              backHref="/tra-cuu-don-hang"
              backLabel={t('order.lookupAnother')}
            />
          </div>
        )}
      </div>
    </PageContainer>
  );
}
