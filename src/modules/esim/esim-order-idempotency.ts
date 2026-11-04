import { FulfillmentStatus, OrderPaymentStatus } from '@prisma/client';
import { isPaymentExpired } from '../order/entities/order.constants';

export const ESIM_ORDER_REUSE_PAYMENTS = [
  OrderPaymentStatus.WAITING_PAYMENT,
  OrderPaymentStatus.PAID,
] as const;

export function esimOrderCreateLockPair(userId: string, variantId: string): [string, string] {
  return [`esim-order:${userId.trim()}`, variantId.trim()];
}

/**
 * Reuse an in-flight eSIM order for the same customer + variant.
 * Completed paid orders are not reused so a later repurchase can start a new item.
 */
export function isReusableEsimOrder(
  order: {
    paymentStatus: OrderPaymentStatus | string;
    fulfillmentStatus: FulfillmentStatus | string;
    paymentExpiresAt?: Date | string | null;
  },
  now = new Date(),
): boolean {
  if (order.paymentStatus === OrderPaymentStatus.WAITING_PAYMENT) {
    return !isPaymentExpired({
      paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
      paymentExpiresAt:
        order.paymentExpiresAt instanceof Date
          ? order.paymentExpiresAt
          : order.paymentExpiresAt
            ? new Date(order.paymentExpiresAt)
            : null,
      now,
    });
  }
  if (order.paymentStatus !== OrderPaymentStatus.PAID) {
    return false;
  }
  return order.fulfillmentStatus !== FulfillmentStatus.COMPLETED;
}
