import type { Payment } from '@/types/api';
import { storePendingQrPayment, type PendingQrPayment } from '@/lib/pending-qr-payment';

/** True when checkout should open dedicated QR waiting page instead of redirect/hosted form. */
export function isInlineQrPayment(payment: Payment): boolean {
  if (payment.checkoutFormFields) return false;
  if (!payment.paymentUrl) return false;
  if (payment.displayMode === 'qr_inline') return true;
  // SePay legacy QR image URL (not PG form post)
  return payment.gateway === 'SEPAY' && !payment.checkoutUrl;
}

/** MegaPay deposit-code / VietQR VA methods — transfer instructions, not hosted VNPAYQR. */
export function isMegapayDepositMethod(
  paymentMethodCode?: string | null,
  paymentGateway?: string | null,
): boolean {
  const method = (paymentMethodCode ?? '').trim().toUpperCase();
  const gateway = (paymentGateway ?? '').trim().toUpperCase();
  if (method === 'VNPAYQR' || method === 'ZALOPAY' || method === 'MEGAPAY_VISA') {
    return false;
  }
  if (method === 'DEPOSIT_CODE' || method === 'VIETQR' || method === 'MEGAPAY_ATM') {
    return true;
  }
  return gateway === 'MEGAPAY' && method !== 'VNPAYQR';
}

/** SePay Payment Gateway hosted checkout (sandbox / production form POST). */
export function isSepayPgCheckout(payment: Payment): boolean {
  return Boolean(
    payment.gateway === 'SEPAY' &&
      payment.checkoutUrl &&
      payment.checkoutFormFields &&
      Object.keys(payment.checkoutFormFields).length > 0,
  );
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

/** Persist MegaPay VA / deposit details so order status can reopen transfer instructions. */
export function persistMegapayVaForReopen(params: {
  orderId: string;
  orderCode: string;
  email: string;
  amount: string;
  paymentReference: string;
  bankInfo: NonNullable<PendingQrPayment['bankInfo']>;
  transferContent?: string | null;
}): void {
  storePendingQrPayment({
    orderId: params.orderId,
    orderCode: params.orderCode,
    email: params.email,
    amount: params.amount,
    paymentUrl: '',
    bankInfo: params.bankInfo,
    transferContent: params.transferContent ?? null,
    expiresAt: null,
    paymentReference: params.paymentReference,
    gateway: 'MEGAPAY',
    createdAt: Date.now(),
  });
}
