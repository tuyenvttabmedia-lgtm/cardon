'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageContainer } from '@/components/layout/PageContainer';
import { useLocale, useMoney, useT } from '@/components/i18n/LocaleProvider';
import { customerFacingError } from '@/lib/i18n/customer-error';
import { withLocalePrefix } from '@/lib/i18n/locale';
import { useAuth } from '@/hooks/useAuth';
import { buildCheckoutPayPath, persistMegapayVaForReopen } from '@/lib/checkout-qr-flow';
import {
  clearPendingMegapayPayment,
  defaultMegapayResumeHref,
  isMegapayAwaitingTransferResult,
  isMegapayCancelResult,
  isMegapaySuccessResult,
  readPendingMegapayPayment,
  type PendingMegapayPayment,
} from '@/lib/pending-megapay-payment';
import { orderApi } from '@/services/api-client';

const POLL_MS = 5000;

type ResultStatus = 'loading' | 'success' | 'awaiting_transfer' | 'cancel' | 'failed';

/**
 * MegaPay PG callBackUrl landing page.
 * MegaPay redirects here after success / fail / cancel, và cả khi vừa cấp mã nộp tiền (00_005).
 */
export default function CheckoutResultClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const t = useT();
  const money = useMoney();
  const { locale } = useLocale();
  const [status, setStatus] = useState<ResultStatus>('loading');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<PendingMegapayPayment | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  const resultCd = searchParams.get('resultCd');
  const resultMsg = searchParams.get('resultMsg');

  const vaInfo = useMemo(
    () => ({
      accountNumber:
        searchParams.get('vaNumber') ??
        searchParams.get('vaAcc') ??
        searchParams.get('vaAccount'),
      accountName: searchParams.get('vaName'),
      bankName: searchParams.get('bankName') ?? searchParams.get('bankCode'),
      content: searchParams.get('vaContent') ?? searchParams.get('invoiceNo'),
      amount: searchParams.get('amount'),
    }),
    [searchParams],
  );

  useEffect(() => {
    const stored = readPendingMegapayPayment();
    setPending(stored);

    if (isMegapaySuccessResult(resultCd)) {
      setStatus('success');
      setMessage(t('result.okRedirect'));
      clearPendingMegapayPayment();
      if (stored?.orderCode) {
        const q = new URLSearchParams({ orderCode: stored.orderCode });
        if (stored.email) q.set('email', stored.email);
        router.replace(withLocalePrefix(`/checkout/success?${q.toString()}`, locale));
        return;
      }
      setMessage(
        t('result.okLookup'),
      );
      return;
    }

    // Mã nộp tiền đã được cấp nhưng chưa nhận được tiền — giữ phiên để theo dõi đơn.
    if (isMegapayAwaitingTransferResult(resultCd)) {
      setStatus('awaiting_transfer');
      setMessage(
        t('result.pending'),
      );
      // Mirror VA into pending-qr storage so «mở lại thanh toán» from order status works
      // (that page only reads cardon:pending-qr:*, not pendingMegapay).
      if (stored?.orderId && stored.orderCode) {
        const accountNumber =
          searchParams.get('vaNumber') ??
          searchParams.get('vaAcc') ??
          searchParams.get('vaAccount');
        if (accountNumber) {
          persistMegapayVaForReopen({
            orderId: stored.orderId,
            orderCode: stored.orderCode,
            email: stored.email ?? '',
            amount: searchParams.get('amount') ?? stored.amount ?? '',
            paymentReference: stored.paymentReference,
            bankInfo: {
              accountNumber,
              accountName: searchParams.get('vaName'),
              bankName: searchParams.get('bankName') ?? searchParams.get('bankCode'),
              bankCode: searchParams.get('bankCode'),
            },
            transferContent:
              searchParams.get('vaContent') ?? searchParams.get('invoiceNo'),
          });
        }
      }
      return;
    }

    // Phiên PG đã kết thúc (hủy / thất bại): xoá pending để không còn dính đơn cũ.
    clearPendingMegapayPayment();

    if (!resultCd && !resultMsg) {
      setStatus('cancel');
      setMessage(
        t('result.incomplete'),
      );
      return;
    }

    if (isMegapayCancelResult(resultCd, resultMsg)) {
      setStatus('cancel');
      setMessage(
        t('result.cancelled'),
      );
      return;
    }

    setStatus('failed');
    setMessage(
      t('result.failed'),
    );
    if (resultMsg?.trim()) console.error('Gateway result message', resultMsg.trim());
  }, [resultCd, resultMsg, router, t, locale, searchParams]);

  const goToSuccess = useCallback(() => {
    if (!pending?.orderCode) return;
    const q = new URLSearchParams({ orderCode: pending.orderCode });
    if (pending.email) q.set('email', pending.email);
    clearPendingMegapayPayment();
    router.replace(withLocalePrefix(`/checkout/success?${q.toString()}`, locale));
  }, [pending, router, locale]);

  const goToSuccessRef = useRef(goToSuccess);
  goToSuccessRef.current = goToSuccess;

  useEffect(() => {
    if (status !== 'awaiting_transfer' || authLoading) return undefined;
    const orderId = pending?.orderId;
    const orderCode = pending?.orderCode;
    const email = pending?.email ?? '';
    if (!orderId || !orderCode) return undefined;
    if (!isAuthenticated && !email) return undefined;

    let active = true;

    async function poll() {
      try {
        const paymentStatus = isAuthenticated
          ? (await orderApi.getById(orderId!)).paymentStatus
          : (await orderApi.lookup(orderCode!, email)).order.paymentStatus;
        if (!active) return;
        setPollError(null);

        if (paymentStatus === 'PAID') {
          setMessage(t('result.paidRedirect'));
          goToSuccessRef.current();
          return;
        }

        if (paymentStatus === 'EXPIRED' || paymentStatus === 'FAILED') {
          setStatus('failed');
          setMessage(
            paymentStatus === 'EXPIRED'
              ? t('result.orderExpired')
              : t('result.failedPaid'),
          );
        }
      } catch (err) {
        if (!active) return;
        setPollError(
          customerFacingError(locale, err),
        );
      }
    }

    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [status, authLoading, isAuthenticated, locale, pending?.orderId, pending?.orderCode, pending?.email, t]);

  const amountLabel = useMemo(() => {
    const raw = vaInfo.amount ?? pending?.amount;
    const value = Number(raw);
    return raw && Number.isFinite(value) ? money(value) : null;
  }, [vaInfo.amount, pending?.amount, money]);

  const heading =
    status === 'success'
      ? t('result.success')
      : status === 'awaiting_transfer'
        ? t('result.awaiting')
        : status === 'cancel'
          ? t('result.cancelledTitle')
          : status === 'failed'
            ? t('result.failedTitle')
            : t('result.title');

  return (
    <PageContainer className="page-footer-gap">
      <div className="mx-auto max-w-lg rounded-2xl border border-cardon-border bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold text-cardon-navy">{heading}</h1>
        <p className="mt-3 text-sm text-cardon-gray">{message}</p>

        {pending?.orderCode && status !== 'success' && (
          <p className="mt-2 text-sm text-cardon-gray">
            {status === 'awaiting_transfer' ? t('result.orderCode') : t('result.unpaid')}:{' '}
            <span className="font-semibold text-cardon-navy">{pending.orderCode}</span>
          </p>
        )}

        {status === 'awaiting_transfer' && (
          <>
            <dl className="mt-5 space-y-3 rounded-xl border border-cardon-border bg-cardon-light p-4 text-sm">
              {amountLabel && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-cardon-gray">{t('result.amount')}</dt>
                  <dd className="text-lg font-bold text-cardon-danger">{amountLabel}</dd>
                </div>
              )}
              {vaInfo.accountNumber && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-cardon-gray">{t('result.accountNo')}</dt>
                  <dd className="font-semibold text-cardon-navy">{vaInfo.accountNumber}</dd>
                </div>
              )}
              {vaInfo.accountName && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-cardon-gray">{t('result.holder')}</dt>
                  <dd className="font-semibold text-cardon-navy">{vaInfo.accountName}</dd>
                </div>
              )}
              {vaInfo.bankName && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-cardon-gray">{t('result.bank')}</dt>
                  <dd className="font-semibold text-cardon-navy">{vaInfo.bankName}</dd>
                </div>
              )}
              {vaInfo.content && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-cardon-gray">{t('result.note')}</dt>
                  <dd className="font-semibold text-cardon-navy">{vaInfo.content}</dd>
                </div>
              )}
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-cardon-gray sm:text-sm">
              {t('result.auto')}
            </p>
            {pollError && <p className="mt-2 text-sm text-red-600">{pollError}</p>}
            {pending?.orderCode && (
              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-4">
                {pending.orderId ? (
                  <Link
                    href={withLocalePrefix(
                      buildCheckoutPayPath({
                        orderId: pending.orderId,
                        orderCode: pending.orderCode,
                        email: pending.email ?? '',
                      }),
                      locale,
                    )}
                    className="text-sm font-semibold text-cardon-blue hover:underline"
                  >
                    {t('order.reopenTransfer')}
                  </Link>
                ) : null}
                <Link
                  href={withLocalePrefix(
                    `/checkout/success?orderCode=${encodeURIComponent(pending.orderCode)}${
                      pending.email ? `&email=${encodeURIComponent(pending.email)}` : ''
                    }`,
                    locale,
                  )}
                  className="text-sm font-semibold text-cardon-blue hover:underline"
                >
                  {t('result.viewOrder')}
                </Link>
              </div>
            )}
          </>
        )}

        {(status === 'cancel' || status === 'failed') && (
          <div className="mt-6">
            <Link href={defaultMegapayResumeHref()} className="btn-checkout !w-auto px-5">
              {t('result.newOrder')}
            </Link>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
