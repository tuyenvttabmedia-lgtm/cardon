'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageContainer } from '@/components/layout/PageContainer';
import { useAuth } from '@/hooks/useAuth';
import {
  clearPendingMegapayPayment,
  defaultMegapayResumeHref,
  isMegapayAwaitingTransferResult,
  isMegapayCancelResult,
  isMegapaySuccessResult,
  readPendingMegapayPayment,
  type PendingMegapayPayment,
} from '@/lib/pending-megapay-payment';
import { formatVnd } from '@/lib/utils';
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
  const [status, setStatus] = useState<ResultStatus>('loading');
  const [message, setMessage] = useState('Đang xử lý kết quả thanh toán…');
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
      setMessage('Thanh toán thành công. Đang chuyển tới trang đơn hàng…');
      clearPendingMegapayPayment();
      if (stored?.orderCode) {
        const q = new URLSearchParams({ orderCode: stored.orderCode });
        if (stored.email) q.set('email', stored.email);
        router.replace(`/checkout/success?${q.toString()}`);
        return;
      }
      setMessage(
        'Thanh toán thành công. Vui lòng tra cứu đơn hàng bằng mã đơn và email đã dùng khi mua.',
      );
      return;
    }

    // Mã nộp tiền đã được cấp nhưng chưa nhận được tiền — giữ phiên để theo dõi đơn.
    if (isMegapayAwaitingTransferResult(resultCd)) {
      setStatus('awaiting_transfer');
      setMessage(
        'Đã tạo mã nộp tiền cho đơn hàng. Vui lòng chuyển khoản đúng số tiền và nội dung bên dưới — thẻ sẽ được giao ngay khi ngân hàng báo có.',
      );
      return;
    }

    // Phiên PG đã kết thúc (hủy / thất bại): xoá pending để không còn dính đơn cũ.
    clearPendingMegapayPayment();

    if (!resultCd && !resultMsg) {
      setStatus('cancel');
      setMessage(
        'Thanh toán chưa hoàn tất. Đơn hàng chưa bị trừ tiền — hãy đặt lại đơn mới trên trang chủ.',
      );
      return;
    }

    if (isMegapayCancelResult(resultCd, resultMsg)) {
      setStatus('cancel');
      setMessage(
        'Bạn đã hủy giao dịch nên đơn hàng chưa được thanh toán. Bạn không bị trừ tiền — hãy đặt lại đơn mới trên trang chủ.',
      );
      return;
    }

    setStatus('failed');
    setMessage(
      `Thanh toán không thành công${resultMsg?.trim() ? `: ${resultMsg.trim()}` : ''}. Bạn không bị trừ tiền — hãy đặt lại đơn mới trên trang chủ.`,
    );
  }, [resultCd, resultMsg, router]);

  const goToSuccess = useCallback(() => {
    if (!pending?.orderCode) return;
    const q = new URLSearchParams({ orderCode: pending.orderCode });
    if (pending.email) q.set('email', pending.email);
    clearPendingMegapayPayment();
    router.replace(`/checkout/success?${q.toString()}`);
  }, [pending, router]);

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
          setMessage('Đã nhận được tiền. Đang chuyển tới trang đơn hàng…');
          goToSuccessRef.current();
          return;
        }

        if (paymentStatus === 'EXPIRED' || paymentStatus === 'FAILED') {
          setStatus('failed');
          setMessage(
            paymentStatus === 'EXPIRED'
              ? 'Đơn hàng đã hết hạn thanh toán. Nếu bạn đã chuyển khoản, vui lòng liên hệ hỗ trợ kèm mã đơn để được xử lý.'
              : 'Thanh toán không thành công. Nếu bạn đã chuyển khoản, vui lòng liên hệ hỗ trợ kèm mã đơn.',
          );
        }
      } catch (err) {
        if (!active) return;
        setPollError(
          err instanceof Error ? err.message : 'Không kiểm tra được trạng thái đơn',
        );
      }
    }

    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [status, authLoading, isAuthenticated, pending?.orderId, pending?.orderCode, pending?.email]);

  const amountLabel = useMemo(() => {
    const raw = vaInfo.amount ?? pending?.amount;
    const value = Number(raw);
    return raw && Number.isFinite(value) ? formatVnd(value) : null;
  }, [vaInfo.amount, pending?.amount]);

  const heading =
    status === 'success'
      ? 'Thanh toán thành công'
      : status === 'awaiting_transfer'
        ? 'Chờ nhận chuyển khoản'
        : status === 'cancel'
          ? 'Đã hủy thanh toán'
          : status === 'failed'
            ? 'Thanh toán thất bại'
            : 'Kết quả thanh toán';

  return (
    <PageContainer className="page-footer-gap">
      <div className="mx-auto max-w-lg rounded-2xl border border-cardon-border bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold text-cardon-navy">{heading}</h1>
        <p className="mt-3 text-sm text-cardon-gray">{message}</p>

        {pending?.orderCode && status !== 'success' && (
          <p className="mt-2 text-sm text-cardon-gray">
            {status === 'awaiting_transfer' ? 'Mã đơn hàng' : 'Đơn chưa thanh toán'}:{' '}
            <span className="font-semibold text-cardon-navy">{pending.orderCode}</span>
          </p>
        )}

        {status === 'awaiting_transfer' && (
          <>
            <dl className="mt-5 space-y-3 rounded-xl border border-cardon-border bg-cardon-light p-4 text-sm">
              {amountLabel && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-cardon-gray">Số tiền</dt>
                  <dd className="text-lg font-bold text-cardon-danger">{amountLabel}</dd>
                </div>
              )}
              {vaInfo.accountNumber && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-cardon-gray">Số tài khoản</dt>
                  <dd className="font-semibold text-cardon-navy">{vaInfo.accountNumber}</dd>
                </div>
              )}
              {vaInfo.accountName && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-cardon-gray">Chủ tài khoản</dt>
                  <dd className="font-semibold text-cardon-navy">{vaInfo.accountName}</dd>
                </div>
              )}
              {vaInfo.bankName && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-cardon-gray">Ngân hàng</dt>
                  <dd className="font-semibold text-cardon-navy">{vaInfo.bankName}</dd>
                </div>
              )}
              {vaInfo.content && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-cardon-gray">Nội dung</dt>
                  <dd className="font-semibold text-cardon-navy">{vaInfo.content}</dd>
                </div>
              )}
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-cardon-gray sm:text-sm">
              Trang này tự cập nhật khi ngân hàng báo có. Chuyển khoản đúng số tiền để đơn được
              xử lý tự động; sai số tiền hoặc quá hạn sẽ phải chờ CSKH đối soát thủ công.
            </p>
            {pollError && <p className="mt-2 text-sm text-red-600">{pollError}</p>}
            {pending?.orderCode && (
              <div className="mt-6">
                <Link
                  href={`/checkout/success?orderCode=${encodeURIComponent(pending.orderCode)}${
                    pending.email ? `&email=${encodeURIComponent(pending.email)}` : ''
                  }`}
                  className="text-sm font-semibold text-cardon-blue hover:underline"
                >
                  Xem trạng thái đơn hàng
                </Link>
              </div>
            )}
          </>
        )}

        {(status === 'cancel' || status === 'failed') && (
          <div className="mt-6">
            <Link href={defaultMegapayResumeHref()} className="btn-checkout !w-auto px-5">
              Đặt lại đơn mới
            </Link>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
