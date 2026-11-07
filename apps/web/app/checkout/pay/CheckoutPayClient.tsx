'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageContainer } from '@/components/layout/PageContainer';
import { SepayQrDisplay } from '@/components/checkout/PaymentPanel';
import { useDateTime, useLocale, useMoney, useT } from '@/components/i18n/LocaleProvider';
import { customerFacingError } from '@/lib/i18n/customer-error';
import { useAuth } from '@/hooks/useAuth';
import {
  clearPendingQrPayment,
  readPendingQrPayment,
  type PendingQrPayment,
} from '@/lib/pending-qr-payment';
import { orderApi } from '@/services/api-client';
import type { Order, OrderItem } from '@/types/api';

const POLL_MS = 4000;

const PAY_STEP_KEYS = ['pay.step1', 'pay.step2', 'pay.step3', 'pay.step4'] as const;

function itemLabel(item: OrderItem, fallback: string): string {
  return item.variant?.name?.trim() || item.variant?.sku || fallback;
}

export default function CheckoutPayPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId') ?? '';
  const orderCode = searchParams.get('orderCode') ?? '';
  const emailParam = searchParams.get('email') ?? '';
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const t = useT();
  const money = useMoney();
  const formatWhen = useDateTime();
  const { locale } = useLocale();

  const [pending, setPending] = useState<PendingQrPayment | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [statusLabel, setStatusLabel] = useState(t('pay.waiting'));
  const [error, setError] = useState<string | null>(null);

  const email = useMemo(
    () => emailParam || pending?.email || order?.guestEmail || user?.email || '',
    [emailParam, pending?.email, order?.guestEmail, user?.email],
  );

  useEffect(() => {
    if (!orderId) return;
    const stored = readPendingQrPayment(orderId);
    if (stored) {
      setPending(stored);
      return;
    }
    setError(t('pay.noQr'));
  }, [orderId, t]);

  useEffect(() => {
    if (authLoading || !orderId || !orderCode) return;
    if (!isAuthenticated && !email) return;

    let active = true;

    async function poll() {
      try {
        let paymentStatus: string | null = null;
        let nextOrder: Order | null = null;

        if (isAuthenticated) {
          nextOrder = await orderApi.getById(orderId);
          paymentStatus = nextOrder.paymentStatus;
        } else {
          const delivery = await orderApi.lookup(orderCode, email);
          nextOrder = delivery.order;
          paymentStatus = delivery.order.paymentStatus;
        }

        if (!active) return;
        if (nextOrder) setOrder(nextOrder);

        if (paymentStatus === 'PAID') {
          setStatusLabel(t('pay.received'));
          clearPendingQrPayment(orderId);
          router.replace(
            `/checkout/success?orderCode=${encodeURIComponent(orderCode)}&email=${encodeURIComponent(email)}`,
          );
          return;
        }

        if (paymentStatus === 'FAILED' || paymentStatus === 'EXPIRED') {
          setStatusLabel(
            paymentStatus === 'EXPIRED' ? t('pay.expired') : t('pay.failed'),
          );
          return;
        }

        setStatusLabel(t('pay.waitingHint'));
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(customerFacingError(locale, err));
      }
    }

    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [authLoading, email, isAuthenticated, locale, orderCode, orderId, router, t]);

  if (!orderId || !orderCode) {
    return (
      <PageContainer>
        <p className="text-cardon-gray">{t('pay.missing')}</p>
      </PageContainer>
    );
  }

  if (error && !pending) {
    return (
      <PageContainer>
        <div className="mx-auto max-w-lg rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <p className="font-semibold text-amber-900">{error}</p>
          <button
            type="button"
            className="mt-4 text-sm font-semibold text-cardon-blue hover:underline"
            onClick={() => router.push('/')}
          >
            ← {t('common.backHome')}
          </button>
        </div>
      </PageContainer>
    );
  }

  if (!pending) {
    return (
      <PageContainer>
        <p className="text-cardon-gray">{t('pay.loadingQr')}</p>
      </PageContainer>
    );
  }

  const amountNumber = Number(pending.amount);
  const amountLabel = Number.isFinite(amountNumber)
    ? money(amountNumber)
    : pending.amount;
  const expiryRaw = pending.expiresAt ?? order?.paymentExpiresAt;
  const expiryLabel = expiryRaw ? formatWhen(expiryRaw) : null;
  const items = order?.items ?? [];

  return (
    <PageContainer className="page-footer-gap">
      <div className="w-full space-y-4 sm:space-y-5">
        {/* Mobile: amount strip above the fold */}
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-cardon-border bg-white px-4 py-3 shadow-card lg:hidden">
          <div className="min-w-0">
            <p className="truncate text-xs text-cardon-gray">
              {t('esim.orderShort')} {orderCode}
            </p>
            <p className="text-xl font-bold text-cardon-danger">{amountLabel}</p>
          </div>
          <p className="shrink-0 text-right text-xs leading-snug text-cardon-blue">{statusLabel}</p>
        </div>

        <div className="grid gap-4 sm:gap-5 lg:grid-cols-2 lg:items-stretch">
          {/* Order summary — second on mobile so QR is reachable first */}
          <div className="order-2 flex flex-col rounded-2xl border border-cardon-border bg-white p-4 shadow-card sm:p-6 lg:order-1">
            <div className="hidden lg:block">
              <p className="text-sm text-cardon-gray">{t('order.order')}</p>
              <p className="text-lg font-bold text-cardon-navy sm:text-xl">{orderCode}</p>
              <p className="mt-4 text-sm text-cardon-gray">{t('pay.amountDue')}</p>
              <p className="text-3xl font-bold text-cardon-danger">{amountLabel}</p>
              <p className="mt-3 text-sm text-cardon-blue">{statusLabel}</p>
            </div>

            <div className="lg:hidden">
              <h2 className="text-base font-semibold text-cardon-navy">{t('pay.details')}</h2>
              <p className="mt-0.5 text-sm text-cardon-gray">{orderCode}</p>
            </div>

            {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

            <div className="mt-4 space-y-3 border-t border-cardon-border pt-4 sm:mt-5 sm:pt-5">
              <h3 className="text-sm font-semibold text-cardon-navy">{t('common.product')}</h3>
              {items.length > 0 ? (
                <ul className="space-y-3">
                  {items.map((item) => {
                    const lineTotal = Number(item.totalAmount);
                    const unit = Number(item.unitPrice);
                    return (
                      <li
                        key={item.id}
                        className="flex items-start justify-between gap-3 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-cardon-navy">{itemLabel(item, t('common.product'))}</p>
                          <p className="mt-0.5 text-xs text-cardon-gray">
                            {t('checkout.qtyLabel')} {item.quantity}
                            {Number.isFinite(unit) ? ` · ${money(unit)}` : null}
                          </p>
                        </div>
                        <p className="shrink-0 font-semibold text-cardon-navy">
                          {Number.isFinite(lineTotal) ? money(lineTotal) : item.totalAmount}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-cardon-gray">{t('pay.loadingItems')}</p>
              )}
            </div>

            {(email || expiryLabel) && (
              <dl className="mt-4 space-y-2.5 rounded-xl bg-cardon-light px-3.5 py-3 text-sm sm:mt-5 sm:px-4 sm:py-3.5">
                {email ? (
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                    <dt className="text-cardon-gray">{t('pay.email')}</dt>
                    <dd className="break-all font-semibold text-cardon-navy">{email}</dd>
                  </div>
                ) : null}
                {expiryLabel ? (
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                    <dt className="text-cardon-gray">{t('pay.deadline')}</dt>
                    <dd className="font-semibold text-cardon-navy">{expiryLabel}</dd>
                  </div>
                ) : null}
              </dl>
            )}

            <div className="mt-4 flex-1 sm:mt-5">
              <h3 className="text-sm font-semibold text-cardon-navy">{t('pay.how')}</h3>
              <ol className="mt-2 space-y-2">
                {PAY_STEP_KEYS.map((step, index) => (
                  <li key={step} className="flex gap-2.5 text-sm leading-snug text-cardon-gray">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cardon-blue/10 text-[11px] font-bold text-cardon-blue">
                      {index + 1}
                    </span>
                    <span>{t(step)}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="mt-5 border-t border-cardon-border pt-4 sm:mt-6 sm:pt-5">
              <button
                type="button"
                className="w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-cardon-navy hover:bg-cardon-light"
                onClick={() =>
                  router.push(
                    `/checkout/success?orderCode=${encodeURIComponent(orderCode)}&email=${encodeURIComponent(email)}`,
                  )
                }
              >
                {t('pay.viewStatus')}
              </button>
              <p className="mt-3 text-xs leading-relaxed text-cardon-gray sm:text-sm">
                {t('pay.viewStatusHint')}
              </p>
            </div>
          </div>

          {/* QR — first on mobile for quicker scan; stretch to match left on desktop */}
          <div className="order-1 flex min-h-0 lg:order-2">
            <SepayQrDisplay paymentUrl={pending.paymentUrl} bankInfo={pending.bankInfo} />
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
