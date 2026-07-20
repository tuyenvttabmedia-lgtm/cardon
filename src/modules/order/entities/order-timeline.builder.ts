import {
  FulfillmentStatus,
  OrderEventType,
  OrderPaymentStatus,
  ProductVariantType,
} from '@prisma/client';
import { resolveCustomerOrderStatus } from './customer-order-status.util';

export type TimelineStepState = 'completed' | 'active' | 'pending';

export interface OrderTimelineStep {
  key: string;
  label: string;
  state: TimelineStepState;
  at: string | null;
}

interface OrderEventRow {
  eventType: OrderEventType;
  createdAt: Date;
}

function hasEvent(events: OrderEventRow[], type: OrderEventType): boolean {
  return events.some((event) => event.eventType === type);
}

function eventAt(events: OrderEventRow[], type: OrderEventType): string | null {
  const found = events.find((event) => event.eventType === type);
  return found ? found.createdAt.toISOString() : null;
}

function resolvePrimaryVariantType(types: ProductVariantType[]): ProductVariantType {
  if (types.includes(ProductVariantType.CARD)) {
    return ProductVariantType.CARD;
  }
  if (types.includes(ProductVariantType.DATA)) {
    return ProductVariantType.DATA;
  }
  if (types.includes(ProductVariantType.TOPUP)) {
    return ProductVariantType.TOPUP;
  }
  return types[0] ?? ProductVariantType.CARD;
}

export function buildOrderTimeline(input: {
  paymentStatus: OrderPaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  variantTypes: ProductVariantType[];
  events: OrderEventRow[];
}): OrderTimelineStep[] {
  const variantType = resolvePrimaryVariantType(input.variantTypes);
  const events = [...input.events].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const customerStatus = resolveCustomerOrderStatus(
    input.paymentStatus,
    input.fulfillmentStatus,
  );

  const paid =
    input.paymentStatus === OrderPaymentStatus.PAID ||
    hasEvent(events, OrderEventType.PAYMENT_SUCCESS);
  const providerRequested = hasEvent(events, OrderEventType.PROVIDER_REQUEST);
  const providerSuccess =
    hasEvent(events, OrderEventType.PROVIDER_SUCCESS) ||
    hasEvent(events, OrderEventType.CARD_DELIVERED) ||
    hasEvent(events, OrderEventType.TOPUP_SUCCESS) ||
    hasEvent(events, OrderEventType.DATA_SUCCESS);
  const emailSent = hasEvent(events, OrderEventType.EMAIL_SENT);
  const delivered =
    input.fulfillmentStatus === FulfillmentStatus.COMPLETED ||
    hasEvent(events, OrderEventType.ORDER_DELIVERED);

  if (variantType === ProductVariantType.CARD) {
    const steps: OrderTimelineStep[] = [
      {
        key: 'payment',
        label: paid ? 'Thanh toán thành công' : 'Chờ thanh toán',
        state: paid ? 'completed' : customerStatus === 'WAITING_PAYMENT' ? 'active' : 'pending',
        at: eventAt(events, OrderEventType.PAYMENT_SUCCESS),
      },
      {
        key: 'fetch_card',
        label: 'Đang lấy mã thẻ',
        state: providerSuccess
          ? 'completed'
          : paid && providerRequested
            ? 'active'
            : paid
              ? 'active'
              : 'pending',
        at: eventAt(events, OrderEventType.PROVIDER_REQUEST),
      },
      {
        key: 'card_received',
        label: 'Đã nhận mã thẻ',
        state: providerSuccess ? 'completed' : paid ? 'pending' : 'pending',
        at:
          eventAt(events, OrderEventType.CARD_DELIVERED) ??
          eventAt(events, OrderEventType.PROVIDER_SUCCESS),
      },
      {
        key: 'email_sent',
        label: 'Email đã gửi',
        state: emailSent ? 'completed' : providerSuccess ? 'active' : 'pending',
        at: eventAt(events, OrderEventType.EMAIL_SENT),
      },
    ];
    return steps;
  }

  const isData = variantType === ProductVariantType.DATA;
  const successEvent = isData ? OrderEventType.DATA_SUCCESS : OrderEventType.TOPUP_SUCCESS;

  return [
    {
      key: 'payment',
      label: paid ? 'Thanh toán thành công' : 'Chờ thanh toán',
      state: paid ? 'completed' : customerStatus === 'WAITING_PAYMENT' ? 'active' : 'pending',
      at: eventAt(events, OrderEventType.PAYMENT_SUCCESS),
    },
    {
      key: 'provider_request',
      label: 'Đang gửi yêu cầu nạp',
      state: providerSuccess
        ? 'completed'
        : paid && (providerRequested || customerStatus === 'PROCESSING_PROVIDER')
          ? 'active'
          : paid
            ? 'active'
            : 'pending',
      at: eventAt(events, OrderEventType.PROVIDER_REQUEST),
    },
    {
      key: 'telco_confirm',
      label: 'Nhà mạng xác nhận',
      state: providerSuccess ? 'completed' : paid ? 'pending' : 'pending',
      at:
        eventAt(events, successEvent) ?? eventAt(events, OrderEventType.PROVIDER_SUCCESS),
    },
    {
      key: 'completed',
      label: 'Hoàn thành',
      state: delivered ? 'completed' : providerSuccess ? 'active' : 'pending',
      at: eventAt(events, OrderEventType.ORDER_DELIVERED),
    },
  ];
}
