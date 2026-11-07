import type { Locale } from '@/lib/i18n/locale';
import { translate, type MessageKey } from '@/lib/i18n/messages';

const PAYMENT_KEYS: Record<string, MessageKey> = {
  WAITING_PAYMENT: 'status.waitingPayment',
  PAID: 'status.paid',
  FAILED: 'status.payFailed',
  EXPIRED: 'status.expired',
  REFUNDED: 'status.refunded',
};

const FULFILLMENT_KEYS: Record<string, MessageKey> = {
  PENDING: 'status.pending',
  PROCESSING: 'status.delivering',
  COMPLETED: 'status.done',
  FAILED: 'status.failed',
  WAITING_ADMIN_RETRY: 'status.retry',
  NEED_MANUAL_REVIEW: 'status.review',
};

const CUSTOMER_KEYS: Record<string, MessageKey> = {
  WAITING_PAYMENT: 'status.waitingPayment',
  PAID: 'status.paid',
  PROCESSING_PROVIDER: 'status.provider',
  DELIVERED: 'status.delivered',
  NEED_SUPPORT: 'status.review',
};

export function paymentStatusLabel(status: string, locale: Locale = 'vi'): string {
  const key = PAYMENT_KEYS[status];
  return key ? translate(locale, key) : status;
}

export function paymentStatusLabelVi(status: string): string {
  return paymentStatusLabel(status, 'vi');
}

export function fulfillmentStatusLabel(status: string, locale: Locale = 'vi'): string {
  const key = FULFILLMENT_KEYS[status];
  return key ? translate(locale, key) : status;
}

export function fulfillmentStatusLabelVi(status: string): string {
  return fulfillmentStatusLabel(status, 'vi');
}

export function customerOrderStatusLabel(status: string, locale: Locale = 'vi'): string {
  const key = CUSTOMER_KEYS[status];
  return key ? translate(locale, key) : status;
}

export function customerOrderStatusLabelVi(status: string): string {
  return customerOrderStatusLabel(status, 'vi');
}

export function resolveCustomerOrderStatusLabel(
  order: {
    customerStatusLabel?: string;
    customerStatus?: string;
    paymentStatus: string;
    fulfillmentStatus: string;
  },
  locale: Locale = 'vi',
): string {
  if (locale === 'vi' && order.customerStatusLabel) return order.customerStatusLabel;
  if (order.customerStatus) return customerOrderStatusLabel(order.customerStatus, locale);
  if (order.paymentStatus === 'WAITING_PAYMENT') return customerOrderStatusLabel('WAITING_PAYMENT', locale);
  if (order.fulfillmentStatus === 'COMPLETED') return customerOrderStatusLabel('DELIVERED', locale);
  if (order.fulfillmentStatus === 'WAITING_ADMIN_RETRY') {
    return customerOrderStatusLabel('PROCESSING_PROVIDER', locale);
  }
  if (order.fulfillmentStatus === 'NEED_MANUAL_REVIEW' || order.fulfillmentStatus === 'FAILED') {
    return customerOrderStatusLabel('NEED_SUPPORT', locale);
  }
  if (
    order.paymentStatus === 'PAID' &&
    (order.fulfillmentStatus === 'PROCESSING' || order.fulfillmentStatus === 'PENDING')
  ) {
    return customerOrderStatusLabel('PROCESSING_PROVIDER', locale);
  }
  return fulfillmentStatusLabel(order.fulfillmentStatus, locale);
}
