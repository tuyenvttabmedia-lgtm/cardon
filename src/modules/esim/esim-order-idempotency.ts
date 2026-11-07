import { FulfillmentStatus, OrderPaymentStatus } from '@prisma/client';
import { isPaymentExpired } from '../order/entities/order.constants';

export const ESIM_ORDER_REUSE_PAYMENTS = [
  OrderPaymentStatus.WAITING_PAYMENT,
  OrderPaymentStatus.PAID,
] as const;

/** Do not hand back a waiting order that is about to expire; payment create would fail. */
export const ESIM_REUSE_MIN_REMAINING_MS = 2 * 60_000;

export function esimOrderCreateLockPair(userId: string, variantId: string): [string, string] {
  return [`esim-order:${userId.trim()}`, variantId.trim()];
}

/** PAID + these statuses are still being fulfilled — reopen that order, do not charge again. */
export const ESIM_REUSE_ACTIVE_FULFILLMENT = [
  FulfillmentStatus.PENDING,
  FulfillmentStatus.PROCESSING,
] as const;

/**
 * Reuse an in-flight eSIM order for the same customer + variant.
 * Completed / failed / manual-review paid orders are not reused so repurchase can start.
 * A PAID order that is still actively fulfilling is reused so the client opens that page
 * instead of creating a second charge.
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
    const paymentExpiresAt =
      order.paymentExpiresAt instanceof Date
        ? order.paymentExpiresAt
        : order.paymentExpiresAt
          ? new Date(order.paymentExpiresAt)
          : null;
    if (
      isPaymentExpired({
        paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
        paymentExpiresAt,
        now,
      })
    ) {
      return false;
    }
    if (paymentExpiresAt && paymentExpiresAt.getTime() - now.getTime() < ESIM_REUSE_MIN_REMAINING_MS) {
      return false;
    }
    return true;
  }
  if (order.paymentStatus !== OrderPaymentStatus.PAID) {
    return false;
  }
  return (ESIM_REUSE_ACTIVE_FULFILLMENT as readonly string[]).includes(
    String(order.fulfillmentStatus),
  );
}
