import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  FulfillmentStatus,
  OrderPaymentStatus,
} from '@prisma/client';

export function assertCanFulfill(paymentStatus: OrderPaymentStatus): void {
  if (paymentStatus !== OrderPaymentStatus.PAID) {
    throw new BadRequestException('Cannot fulfill unpaid order');
  }
}

export function assertCanModifyOrderMetadata(params: {
  paymentStatus: OrderPaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
}): void {
  if (params.fulfillmentStatus === FulfillmentStatus.COMPLETED) {
    throw new ConflictException('Cannot modify completed order');
  }
  if (params.paymentStatus === OrderPaymentStatus.PAID) {
    throw new ConflictException('Cannot modify order after payment');
  }
}

/** Blocks changes to amount, quantity, variant_id on order_items. */
export function assertOrderItemsFrozen(params: {
  paymentStatus: OrderPaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
}): void {
  if (params.fulfillmentStatus === FulfillmentStatus.COMPLETED) {
    throw new ConflictException('Cannot modify order items on completed order');
  }
  if (params.paymentStatus === OrderPaymentStatus.PAID) {
    throw new ConflictException('Cannot modify order items on paid order');
  }
}

/** Used by Payment phase before marking order PAID. */
export function assertCanMarkPaid(params: {
  paymentStatus: OrderPaymentStatus;
  paymentExpiresAt: Date | null;
  now?: Date;
}): void {
  if (params.paymentStatus === OrderPaymentStatus.EXPIRED) {
    throw new BadRequestException('Expired order cannot be paid');
  }
  if (params.paymentStatus !== OrderPaymentStatus.WAITING_PAYMENT) {
    throw new BadRequestException('Order is not awaiting payment');
  }
  const now = params.now ?? new Date();
  if (
    params.paymentExpiresAt &&
    params.paymentExpiresAt.getTime() < now.getTime()
  ) {
    throw new BadRequestException('Payment window has expired');
  }
}

export function assertPaymentTransition(
  current: OrderPaymentStatus,
  next: OrderPaymentStatus,
): void {
  const allowed: Partial<Record<OrderPaymentStatus, OrderPaymentStatus[]>> = {
    [OrderPaymentStatus.WAITING_PAYMENT]: [
      OrderPaymentStatus.PAID,
      OrderPaymentStatus.FAILED,
      OrderPaymentStatus.EXPIRED,
    ],
    [OrderPaymentStatus.PAID]: [OrderPaymentStatus.REFUNDED],
    [OrderPaymentStatus.EXPIRED]: [],
    [OrderPaymentStatus.FAILED]: [],
  };

  const transitions = allowed[current] ?? [];
  if (!transitions.includes(next)) {
    throw new BadRequestException(
      `Invalid payment status transition: ${current} → ${next}`,
    );
  }
}

export function assertFulfillmentTransition(
  current: FulfillmentStatus,
  next: FulfillmentStatus,
  paymentStatus: OrderPaymentStatus,
): void {
  if (next !== FulfillmentStatus.PENDING && paymentStatus !== OrderPaymentStatus.PAID) {
    throw new BadRequestException('Cannot fulfill unpaid order');
  }

  if (current === FulfillmentStatus.COMPLETED) {
    throw new ConflictException('Cannot modify completed order');
  }
}

/** @deprecated Use assertCanModifyOrderMetadata */
export function assertCanModifyOrder(params: {
  fulfillmentStatus: FulfillmentStatus;
}): void {
  if (params.fulfillmentStatus === FulfillmentStatus.COMPLETED) {
    throw new ConflictException('Cannot modify completed order');
  }
}
