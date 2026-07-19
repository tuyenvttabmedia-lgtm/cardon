import { Order, OrderItem, ProductVariant, User } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { decimalToString } from '../../order/entities/order.mapper';

export interface AdminOrderListItemView {
  id: string;
  orderCode: string;
  customerEmail: string | null;
  customerPhone: string | null;
  productType: string;
  customerPaid: string;
  providerCost: string;
  gatewayFee: string;
  profit: string;
  paymentMethod: string | null;
  paymentStatus: string;
  fulfillmentStatus: string;
  createdAt: string;
  totalAmount: string;
}

type OrderListRow = Order & {
  orderItems: (OrderItem & { variant?: Pick<ProductVariant, 'sku' | 'name' | 'type'> | null })[];
  user: Pick<User, 'email' | 'phone'> | null;
};

function resolveProductType(items: OrderListRow['orderItems']): string {
  const types = new Set(items.map((item) => item.variant?.type).filter(Boolean));
  if (types.size === 0) return 'CARD';
  if (types.size === 1) return [...types][0] as string;
  return 'MIXED';
}

function calcProfit(order: Order): string {
  const paid = new Decimal(order.customerPaid ?? 0);
  const cost = new Decimal(order.providerCost ?? 0);
  const fee = new Decimal(order.paymentFeeAmount ?? 0);
  return decimalToString(paid.sub(cost).sub(fee));
}

export function mapAdminOrderListItem(order: OrderListRow): AdminOrderListItemView {
  return {
    id: order.id,
    orderCode: order.orderCode,
    customerEmail: order.user?.email ?? order.guestEmail,
    customerPhone: order.user?.phone ?? order.guestPhone,
    productType: resolveProductType(order.orderItems),
    customerPaid: decimalToString(order.customerPaid),
    providerCost: decimalToString(order.providerCost),
    gatewayFee: decimalToString(order.paymentFeeAmount),
    profit: calcProfit(order),
    paymentMethod: order.methodDisplayName ?? order.paymentMethodCode,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    createdAt: order.createdAt.toISOString(),
    totalAmount: decimalToString(order.totalAmount),
  };
}

export { calcProfit };
