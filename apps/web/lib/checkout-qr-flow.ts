import type { Payment } from '@/types/api';
import { storePendingQrPayment } from '@/lib/pending-qr-payment';

/** True when checkout should open dedicated QR waiting page instead of redirect/hosted form. */
export function isInlineQrPayment(payment: Payment): boolean {
  if (payment.checkoutFormFields) return false;
  if (!payment.paymentUrl) return false;
  if (payment.displayMode === 'qr_inline') return true;
  // SePay legacy QR image URL (not PG form post)
  return payment.gateway === 'SEPAY' && !payment.checkoutUrl;
}

export function buildCheckoutPayPath(params: {
  orderId: string;
  orderCode: string;
  email: string;
}): string {
  const q = new URLSearchParams({
    orderId: params.orderId,
    orderCode: params.orderCode,
    email: params.email,
  });
  return `/checkout/pay?${q.toString()}`;
}

export function persistAndPathForQrPayment(params: {
  orderId: string;
  orderCode: string;
  email: string;
  payment: Payment;
}): string {
  storePendingQrPayment({
    orderId: params.orderId,
    orderCode: params.orderCode,
    email: params.email,
    amount: params.payment.amount,
    paymentUrl: params.payment.paymentUrl!,
    bankInfo: params.payment.bankInfo ?? null,
    expiresAt: params.payment.expiresAt,
    paymentReference: params.payment.paymentReference,
    gateway: params.payment.gateway,
    createdAt: Date.now(),
  });
  return buildCheckoutPayPath({
    orderId: params.orderId,
    orderCode: params.orderCode,
    email: params.email,
  });
}
