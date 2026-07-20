import { FulfillmentStatus, OrderPaymentStatus } from '@prisma/client';

export type CustomerOrderStatus =
  | 'WAITING_PAYMENT'
  | 'PAID'
  | 'PROCESSING_PROVIDER'
  | 'DELIVERED'
  | 'NEED_SUPPORT';

const CUSTOMER_STATUS_LABELS: Record<CustomerOrderStatus, string> = {
  WAITING_PAYMENT: 'Chờ thanh toán',
  PAID: 'Đã thanh toán',
  PROCESSING_PROVIDER: 'Đang xử lý',
  DELIVERED: 'Hoàn thành',
  NEED_SUPPORT: 'Cần hỗ trợ',
};

export function resolveCustomerOrderStatus(
  paymentStatus: OrderPaymentStatus | string,
  fulfillmentStatus: FulfillmentStatus | string,
): CustomerOrderStatus {
  if (paymentStatus === OrderPaymentStatus.WAITING_PAYMENT) {
    return 'WAITING_PAYMENT';
  }

  if (
    paymentStatus === OrderPaymentStatus.FAILED ||
    paymentStatus === OrderPaymentStatus.EXPIRED ||
    paymentStatus === OrderPaymentStatus.REFUNDED
  ) {
    return 'NEED_SUPPORT';
  }

  if (fulfillmentStatus === FulfillmentStatus.COMPLETED) {
    return 'DELIVERED';
  }

  // Admin-retry queue (OOS / low balance): customer still sees “processing”, not support.
  if (fulfillmentStatus === FulfillmentStatus.WAITING_ADMIN_RETRY) {
    return paymentStatus === OrderPaymentStatus.PAID
      ? 'PROCESSING_PROVIDER'
      : 'PAID';
  }

  if (
    fulfillmentStatus === FulfillmentStatus.NEED_MANUAL_REVIEW ||
    fulfillmentStatus === FulfillmentStatus.FAILED
  ) {
    return 'NEED_SUPPORT';
  }

  if (
    fulfillmentStatus === FulfillmentStatus.PROCESSING ||
    fulfillmentStatus === FulfillmentStatus.PENDING
  ) {
    return paymentStatus === OrderPaymentStatus.PAID
      ? 'PROCESSING_PROVIDER'
      : 'PAID';
  }

  return paymentStatus === OrderPaymentStatus.PAID ? 'PAID' : 'WAITING_PAYMENT';
}

export function customerOrderStatusLabel(status: CustomerOrderStatus): string {
  return CUSTOMER_STATUS_LABELS[status];
}
