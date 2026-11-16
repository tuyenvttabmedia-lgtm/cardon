'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MegapayPgCheckoutOpen } from '@/components/checkout/MegapayPgCheckoutOpen';
import { PageContainer } from '@/components/layout/PageContainer';
import { useLocale, useMoney, useT } from '@/components/i18n/LocaleProvider';
import { customerFacingError } from '@/lib/i18n/customer-error';
import { withLocalePrefix } from '@/lib/i18n/locale';
import { useAuth } from '@/hooks/useAuth';
import {
  buildMegapayWaitingPath,
  canOpenStoredMegapayForm,
  canResumeMegapayWaiting,
  clearPendingMegapayPayment,
  readPendingMegapayPayment,
  storePendingMegapayPayment,
  type PendingMegapayPayment,
} from '@/lib/pending-megapay-payment';
import { orderApi, paymentApi } from '@/services/api-client';
import { generateIdempotencyKey } from '@/lib/utils';

const POLL_MS = 5000;

/**
 * CardOn “payment station” for MegaPay PG.
 * Browser Back from pg.megapay.vn should land here (not the product page).
 * Reopen always mints a new invoiceNo — MegaPay rejects duplicate invoice numbers.
 */
export default function CheckoutWaitingClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useT();
  const money = useMoney();
  const { locale } = useLocale();
  const { isAuthenticated, loading: authLoading } = useAuth();

  const orderIdParam = searchParams.get('orderId') ?? '';
  const orderCodeParam = searchParams.get('orderCode') ?? '';
  const emailParam = searchParams.get('email') ?? '';
  const shouldAutoOpen = searchParams.get('open') === '1';

  const [pending, setPending] = useState<PendingMegapayPayment | null>(null);
  const [openNonce, setOpenNonce] = useState(0);
  const [autoOpen, setAutoOpen] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [statusLabel, setStatusLabel] = useState(t('wait.checking'));
  const [pollError, setPollError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const orderId = pending?.orderId || orderIdParam;
  const orderCode = pending?.orderCode || orderCodeParam;
  const email = emailParam || pending?.email || '';

  useEffect(() => {
    const stored = readPendingMegapayPayment();
    if (
      stored &&
      (!orderIdParam || stored.orderId === orderIdParam || stored.orderCode === orderCodeParam)
    ) {
      setPending(stored);
      return;
    }
    if (stored && !orderIdParam && !orderCodeParam) {
      setPending(stored);
    }
  }, [orderIdParam, orderCodeParam]);

  // First arrival with ?open=1: open the original invoice once, then strip the flag.
  useEffect(() => {
    if (!shouldAutoOpen || !canOpenStoredMegapayForm(pending)) return;
    setAutoOpen(true);
    setOpenNonce((n) => n + 1);
    const next = buildMegapayWaitingPath({
      orderId: pending!.orderId,
      orderCode: pending!.orderCode,
      email: pending!.email || emailParam,
      open: false,
    });
    router.replace(withLocalePrefix(next, locale));
  }, [shouldAutoOpen, pending, emailParam, router, locale]);

  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (!event.persisted) return;
      setPending(readPendingMegapayPayment());
      setAutoOpen(false);
      setStatusLabel(t('wait.backHint'));
    }
    function onVisible() {
      if (document.visibilityState !== 'visible') return;
      setPending(readPendingMegapayPayment());
    }
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [t]);

  const goSuccess = useCallback(() => {
    if (!orderCode) return;
    const q = new URLSearchParams({ orderCode });
    if (email) q.set('email', email);
    clearPendingMegapayPayment();
    router.replace(withLocalePrefix(`/checkout/success?${q.toString()}`, locale));
  }, [orderCode, email, router, locale]);

  useEffect(() => {
    if (authLoading || !orderId || !orderCode) return undefined;
    if (!isAuthenticated && !email) return undefined;

    let active = true;

    async function poll() {
      try {
        const paymentStatus = isAuthenticated
          ? (await orderApi.getById(orderId)).paymentStatus
          : (await orderApi.lookup(orderCode, email)).order.paymentStatus;
        if (!active) return;
        setPollError(null);

        if (paymentStatus === 'PAID') {
          setStatusLabel(t('wait.paid'));
          goSuccess();
          return;
        }
        if (paymentStatus === 'EXPIRED' || paymentStatus === 'FAILED') {
          setStatusLabel(paymentStatus === 'EXPIRED' ? t('wait.expired') : t('wait.failed'));
          return;
        }
        setStatusLabel(t('wait.pending'));
      } catch (err) {
        if (!active) return;
        setPollError(customerFacingError(locale, err));
      }
    }

    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [authLoading, isAuthenticated, orderId, orderCode, email, locale, t, goSuccess]);

  const amountLabel = useMemo(() => {
    const raw = pending?.amount;
    const value = Number(raw);
    return raw && Number.isFinite(value) ? money(value) : null;
  }, [pending?.amount, money]);

  const canResume = canResumeMegapayWaiting(pending) || Boolean(orderId && orderCode);
  const orderHref = orderCode
    ? withLocalePrefix(
        `/checkout/success?orderCode=${encodeURIComponent(orderCode)}${
          email ? `&email=${encodeURIComponent(email)}` : ''
        }`,
        locale,
      )
    : withLocalePrefix('/tai-khoan/lich-su-giao-dich', locale);

  async function reopenGateway() {
    if (!orderId || reopening) return;
    setReopening(true);
    setActionError(null);
    setStatusLabel(t('wait.reopening'));
    try {
      // Always mint a new MegaPay invoice — reusing invoiceNo returns "already exist".
      const pay = await paymentApi.create(
        {
          orderId,
          gateway: 'MEGAPAY',
          ...(!isAuthenticated && email ? { guestEmail: email } : {}),
        },
        generateIdempotencyKey(),
      );
      if (!pay.checkoutFormFields || !pay.checkoutClient) {
        throw new Error(t('wait.reopenFailed'));
      }
      const next: PendingMegapayPayment = {
        orderId,
        orderCode: orderCode || pending?.orderCode || '',
        email: email || pending?.email || '',
        paymentReference: pay.paymentReference,
        resumeHref: pending?.resumeHref || '/',
        amount: pay.amount ?? pending?.amount,
        payType: pay.checkoutFormFields.payType ?? pending?.payType,
        checkoutFormFields: pay.checkoutFormFields,
        checkoutClient: pay.checkoutClient,
        savedAt: Date.now(),
      };
      storePendingMegapayPayment(next);
      setPending(next);
      setAutoOpen(true);
      setOpenNonce((n) => n + 1);
    } catch (err) {
      setActionError(customerFacingError(locale, err));
      setStatusLabel(t('wait.pending'));
    } finally {
      setReopening(false);
    }
  }

  return (
    <PageContainer className="page-footer-gap">
      <div className="mx-auto max-w-lg rounded-2xl border border-cardon-border bg-white p-5 shadow-sm sm:p-8">
        <p className="text-xs font-bold uppercase tracking-wide text-cardon-blue">{t('wait.badge')}</p>
        <h1 className="mt-1 text-2xl font-bold text-cardon-navy">{t('wait.title')}</h1>
        <p className="mt-2 text-sm text-cardon-gray">{t('wait.body')}</p>

        {orderCode ? (
          <dl className="mt-5 space-y-2 rounded-xl border border-cardon-border bg-cardon-light/60 p-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-cardon-gray">{t('result.orderCode')}</dt>
              <dd className="font-semibold text-cardon-navy">{orderCode}</dd>
            </div>
            {amountLabel ? (
              <div className="flex justify-between gap-3">
                <dt className="text-cardon-gray">{t('result.amount')}</dt>
                <dd className="text-lg font-bold text-cardon-danger">{amountLabel}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-3">
              <dt className="text-cardon-gray">{t('wait.status')}</dt>
              <dd className="font-medium text-cardon-navy">{statusLabel}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-5 text-sm text-amber-800">{t('wait.missing')}</p>
        )}

        {pollError ? <p className="mt-3 text-sm text-red-600">{pollError}</p> : null}
        {actionError ? <p className="mt-3 text-sm text-red-600">{actionError}</p> : null}

        <div className="mt-6 flex flex-col gap-2">
          {canResume ? (
            <button
              type="button"
              className="btn-checkout"
              disabled={reopening}
              onClick={() => void reopenGateway()}
            >
              {reopening ? t('wait.reopening') : t('wait.reopen')}
            </button>
          ) : null}
          <Link
            href={orderHref}
            className="rounded-xl border border-cardon-border px-4 py-3 text-center text-sm font-semibold text-cardon-navy hover:bg-cardon-light"
          >
            {t('wait.viewOrder')}
          </Link>
          <Link
            href={withLocalePrefix(pending?.resumeHref || '/', locale)}
            className="py-2 text-center text-sm font-semibold text-cardon-blue hover:underline"
          >
            {t('wait.later')}
          </Link>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-cardon-gray">{t('wait.hint')}</p>

        {canOpenStoredMegapayForm(pending) && pending?.checkoutFormFields && pending.checkoutClient ? (
          <MegapayPgCheckoutOpen
            key={`${pending.paymentReference}-${openNonce}`}
            checkoutFormFields={pending.checkoutFormFields}
            checkoutClient={pending.checkoutClient}
            orderId={pending.orderId}
            orderCode={pending.orderCode}
            email={pending.email}
            paymentReference={pending.paymentReference}
            resumeHref={pending.resumeHref}
            amount={pending.amount}
            autoOpen={autoOpen}
            quiet
            onOpened={() => setAutoOpen(false)}
          />
        ) : null}
      </div>
    </PageContainer>
  );
}
