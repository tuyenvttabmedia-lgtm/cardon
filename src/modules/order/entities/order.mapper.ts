import {
  FulfillmentStatus,
  Order,
  OrderItem,
  OrderPaymentStatus,
  ProductVariant,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  customerOrderStatusLabel,
  resolveCustomerOrderStatus,
} from './customer-order-status.util';
export interface InvoiceMetadata {
  companyName?: string;
  taxCode?: string;
  address?: string;
}

export interface OrderItemView {
  id: string;
  variantId: string;
  quantity: number;
  unitPrice: string;
  discount: string;
  totalAmount: string;
  status: string;
  variant?: {
    sku: string;
    name: string;
  };
}

export interface OrderView {
  id: string;
  orderCode: string;
  channel: string;
  isGuestOrder: boolean;
  guestEmail: string | null;
  guestPhone: string | null;
  invoiceRequired: boolean;
  invoiceMetadata: InvoiceMetadata;
  customerNote: string | null;
  totalAmount: string;
  faceValue: string;
  sellAmount: string;
  discountAmount: string;
  paymentMethodCode: string | null;
  methodDisplayName: string | null;
  paymentGateway: string | null;
  settlementType: string | null;
  paymentFeePercent: string;
  paymentFeeFixed: string;
  paymentFeeAmount: string;
  customerPaid: string;
  providerCost: string;
  profit: string;
  paymentStatus: OrderPaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  customerStatus: string;
  customerStatusLabel: string;
  paymentExpiresAt: string | null;
  createdAt: string;
  items: OrderItemView[];
}

export function decimalToString(value: Decimal | number | string | null | undefined): string {
  if (value === null || value === undefined) {
    return '0.00';
  }
  return new Decimal(value).toFixed(2);
}

export function parseInvoiceMetadata(value: unknown): InvoiceMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const record = value as Record<string, unknown>;
  return {
    companyName:
      typeof record.companyName === 'string' ? record.companyName : undefined,
    taxCode: typeof record.taxCode === 'string' ? record.taxCode : undefined,
    address: typeof record.address === 'string' ? record.address : undefined,
  };
}

type OrderWithItems = Order & {
  orderItems: (OrderItem & {
    variant?: Pick<ProductVariant, 'sku' | 'name'> | null;
  })[];
};

export function mapOrder(order: OrderWithItems): OrderView {
  const customerStatus = resolveCustomerOrderStatus(
    order.paymentStatus,
    order.fulfillmentStatus,
  );

  return {
    id: order.id,
    orderCode: order.orderCode,
    channel: order.channel,
    isGuestOrder: order.isGuestOrder,
    guestEmail: order.guestEmail,
    guestPhone: order.guestPhone,
    invoiceRequired: order.invoiceRequired,
    invoiceMetadata: parseInvoiceMetadata(order.invoiceMetadata),
    customerNote: order.customerNote,
    totalAmount: decimalToString(order.totalAmount),
    faceValue: decimalToString(order.faceValue),
    sellAmount: decimalToString(order.sellAmount),
    discountAmount: decimalToString(order.discountAmount),
    paymentMethodCode: order.paymentMethodCode,
    methodDisplayName: order.methodDisplayName,
    paymentGateway: order.paymentGateway,
    settlementType: order.settlementType,
    paymentFeePercent: decimalToString(order.paymentFeePercent),
    paymentFeeFixed: decimalToString(order.paymentFeeFixed),
    paymentFeeAmount: decimalToString(order.paymentFeeAmount),
    customerPaid: decimalToString(order.customerPaid),
    providerCost: decimalToString(order.providerCost),
    profit: decimalToString(order.profit),
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    customerStatus,
    customerStatusLabel: customerOrderStatusLabel(customerStatus),
    paymentExpiresAt: order.paymentExpiresAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    items: order.orderItems.map(mapOrderItem),
  };
}

export function mapOrderItem(
  item: OrderItem & {
    variant?: Pick<ProductVariant, 'sku' | 'name'> | null;
  },
): OrderItemView {
  return {
    id: item.id,
    variantId: item.variantId,
    quantity: item.quantity,
    unitPrice: decimalToString(item.unitPrice),
    discount: decimalToString(item.discount),
    totalAmount: decimalToString(item.totalAmount),
    status: item.status,
    variant: item.variant
      ? { sku: item.variant.sku, name: item.variant.name }
      : undefined,
  };
}
