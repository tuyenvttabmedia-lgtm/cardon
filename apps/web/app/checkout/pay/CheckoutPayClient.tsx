'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageContainer } from '@/components/layout/PageContainer';
import { SepayQrDisplay } from '@/components/checkout/PaymentPanel';
import { useAuth } from '@/hooks/useAuth';
import {
  clearPendingQrPayment,
  readPendingQrPayment,
  type PendingQrPayment,
} from '@/lib/pending-qr-payment';
import { formatVnd } from '@/lib/utils';
import { ApiClientError, orderApi } from '@/services/api-client';

const POLL_MS = 4000;

export default function CheckoutPayPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId') ?? '';
  const orderCode = searchParams.get('orderCode') ?? '';
  const emailParam = searchParams.get('email') ?? '';
  const { isAuthenticated, loading: authLoading } = useAuth();

  const [pending, setPending] = useState<PendingQrPayment | null>(null);
  const [statusLabel, setStatusLabel] = useState('Đang chờ thanh toán…');
  const [error, setError] = useState<string | null>(null);

  const email = useMemo(
    () => emailParam || pending?.email || '',
    [emailParam, pending?.email],
  );

  useEffect(() => {
    if (!orderId) return;
    const stored = readPendingQrPayment(orderId);
    if (stored) {
      setPending(stored);
      return;
    }
    setError('Không tìm thấy thông tin QR. Vui lòng tạo lại đơn từ trang thanh toán.');
  }, [orderId]);

  useEffect(() => {
    if (authLoading || !orderId || !orderCode) return;
    if (!isAuthenticated && !email) return;

    let active = true;

    async function poll() {
      try {
        let paymentStatus: string | null = null;

        if (isAuthenticated) {
          const order = await orderApi.getById(orderId);
          paymentStatus = order.paymentStatus;
        } else {
          const delivery = await orderApi.lookup(orderCode, email);
          paymentStatus = delivery.order.paymentStatus;
        }

        if (!active) return;

        if (paymentStatus === 'PAID') {
          setStatusLabel('Đã nhận thanh toán — đang chuyển trang…');
          clearPendingQrPayment(orderId);
          router.replace(
            `/checkout/success?orderCode=${encodeURIComponent(orderCode)}&email=${encodeURIComponent(email)}`,
          );
          return;
        }

        if (paymentStatus === 'FAILED' || paymentStatus === 'EXPIRED') {
          setStatusLabel(
            paymentStatus === 'EXPIRED'
              ? 'Giao dịch đã hết hạn. Vui lòng tạo đơn mới.'
              : 'Thanh toán thất bại. Vui lòng tạo đơn mới.',
          );
          return;
        }

        setStatusLabel('Đang chờ thanh toán… Quét QR hoặc chuyển khoản đúng số tiền.');
        setError(null);
      } catch (err) {
        if (!active) return;
        const message =
          err instanceof ApiClientError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Không kiểm tra được trạng thái đơn';
        setError(message);
      }
    }

    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [authLoading, email, isAuthenticated, orderCode, orderId, router]);

  if (!orderId || !orderCode) {
    return (
      <PageContainer>
        <p className="text-cardon-gray">Thiếu thông tin đơn hàng.</p>
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
            ← Về trang chủ
          </button>
        </div>
      </PageContainer>
    );
  }

  if (!pending) {
    return (
      <PageContainer>
        <p className="text-cardon-gray">Đang tải mã QR…</p>
      </PageContainer>
    );
  }

  const amountNumber = Number(pending.amount);

  return (
    <PageContainer className="page-footer-gap">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="rounded-2xl border border-cardon-border bg-white p-5 shadow-card">
          <p className="text-sm text-cardon-gray">Đơn hàng</p>
          <p className="text-lg font-bold text-cardon-navy">{orderCode}</p>
          <p className="mt-3 text-sm text-cardon-gray">Số tiền cần chuyển</p>
          <p className="text-2xl font-bold text-cardon-danger">
            {Number.isFinite(amountNumber) ? formatVnd(amountNumber) : pending.amount}
          </p>
          <p className="mt-2 text-sm text-cardon-blue">{statusLabel}</p>
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        </div>

        <SepayQrDisplay paymentUrl={pending.paymentUrl} bankInfo={pending.bankInfo} />

        <button
          type="button"
          className="w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-cardon-navy hover:bg-cardon-light"
          onClick={() =>
            router.push(
              `/checkout/success?orderCode=${encodeURIComponent(orderCode)}&email=${encodeURIComponent(email)}`,
            )
          }
        >
          Đã chuyển khoản — xem trạng thái
        </button>
      </div>
    </PageContainer>
  );
}
