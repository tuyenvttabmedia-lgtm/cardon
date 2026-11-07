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
import type { Order, OrderItem } from '@/types/api';

const POLL_MS = 4000;

const PAY_STEPS = [
  'Mở app ngân hàng và chọn Quét QR / VietQR.',
  'Quét mã bên cạnh (hoặc dưới trên điện thoại).',
  'Kiểm tra đúng số tiền trước khi xác nhận.',
  'Đợi vài giây — hệ thống tự xác nhận khi ngân hàng báo có.',
] as const;

function itemLabel(item: OrderItem): string {
  return item.variant?.name?.trim() || item.variant?.sku || 'Sản phẩm';
}

function formatExpiry(expiresAt: string | null | undefined): string | null {
  if (!expiresAt) return null;
  const ms = Date.parse(expiresAt);
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(ms));
}

export default function CheckoutPayPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId') ?? '';
  const orderCode = searchParams.get('orderCode') ?? '';
  const emailParam = searchParams.get('email') ?? '';
  const { isAuthenticated, loading: authLoading, user } = useAuth();

  const [pending, setPending] = useState<PendingQrPayment | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [statusLabel, setStatusLabel] = useState('Đang chờ thanh toán…');
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
    setError('Không tìm thấy thông tin QR. Vui lòng tạo lại đơn từ trang thanh toán.');
  }, [orderId]);

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
  const amountLabel = Number.isFinite(amountNumber)
    ? formatVnd(amountNumber)
    : pending.amount;
  const expiryLabel = formatExpiry(pending.expiresAt ?? order?.paymentExpiresAt);
  const items = order?.items ?? [];

  return (
    <PageContainer className="page-footer-gap">
      <div className="w-full space-y-4 sm:space-y-5">
        {/* Mobile: amount strip above the fold */}
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-cardon-border bg-white px-4 py-3 shadow-card lg:hidden">
          <div className="min-w-0">
            <p className="truncate text-xs text-cardon-gray">Đơn {orderCode}</p>
            <p className="text-xl font-bold text-cardon-danger">{amountLabel}</p>
          </div>
          <p className="shrink-0 text-right text-xs leading-snug text-cardon-blue">{statusLabel}</p>
        </div>

        <div className="grid gap-4 sm:gap-5 lg:grid-cols-2 lg:items-stretch">
          {/* Order summary — second on mobile so QR is reachable first */}
          <div className="order-2 flex flex-col rounded-2xl border border-cardon-border bg-white p-4 shadow-card sm:p-6 lg:order-1">
            <div className="hidden lg:block">
              <p className="text-sm text-cardon-gray">Đơn hàng</p>
              <p className="text-lg font-bold text-cardon-navy sm:text-xl">{orderCode}</p>
              <p className="mt-4 text-sm text-cardon-gray">Số tiền cần chuyển</p>
              <p className="text-3xl font-bold text-cardon-danger">{amountLabel}</p>
              <p className="mt-3 text-sm text-cardon-blue">{statusLabel}</p>
            </div>

            <div className="lg:hidden">
              <h2 className="text-base font-semibold text-cardon-navy">Chi tiết đơn</h2>
              <p className="mt-0.5 text-sm text-cardon-gray">{orderCode}</p>
            </div>

            {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

            <div className="mt-4 space-y-3 border-t border-cardon-border pt-4 sm:mt-5 sm:pt-5">
              <h3 className="text-sm font-semibold text-cardon-navy">Sản phẩm</h3>
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
                          <p className="font-medium text-cardon-navy">{itemLabel(item)}</p>
                          <p className="mt-0.5 text-xs text-cardon-gray">
                            SL {item.quantity}
                            {Number.isFinite(unit) ? ` · ${formatVnd(unit)}` : null}
                          </p>
                        </div>
                        <p className="shrink-0 font-semibold text-cardon-navy">
                          {Number.isFinite(lineTotal) ? formatVnd(lineTotal) : item.totalAmount}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-cardon-gray">Đang tải chi tiết sản phẩm…</p>
              )}
            </div>

            {(email || expiryLabel) && (
              <dl className="mt-4 space-y-2.5 rounded-xl bg-cardon-light px-3.5 py-3 text-sm sm:mt-5 sm:px-4 sm:py-3.5">
                {email ? (
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                    <dt className="text-cardon-gray">Email nhận eSIM / mã</dt>
                    <dd className="break-all font-semibold text-cardon-navy">{email}</dd>
                  </div>
                ) : null}
                {expiryLabel ? (
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                    <dt className="text-cardon-gray">Hạn thanh toán</dt>
                    <dd className="font-semibold text-cardon-navy">{expiryLabel}</dd>
                  </div>
                ) : null}
              </dl>
            )}

            <div className="mt-4 flex-1 sm:mt-5">
              <h3 className="text-sm font-semibold text-cardon-navy">Cách thanh toán</h3>
              <ol className="mt-2 space-y-2">
                {PAY_STEPS.map((step, index) => (
                  <li key={step} className="flex gap-2.5 text-sm leading-snug text-cardon-gray">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cardon-blue/10 text-[11px] font-bold text-cardon-blue">
                      {index + 1}
                    </span>
                    <span>{step}</span>
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
                Xem trạng thái đơn (chưa xác nhận thanh toán)
              </button>
              <p className="mt-3 text-xs leading-relaxed text-cardon-gray sm:text-sm">
                Đơn sẽ được xác nhận sau khi hệ thống nhận được báo có từ ngân hàng. Nút trên chỉ xem
                trạng thái, không tự đánh dấu đã thanh toán.
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
