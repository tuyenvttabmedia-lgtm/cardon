import { Agent, Order, OrderItem, ProductVariant, User } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { decimalToString } from '../../order/entities/order.mapper';

export interface AdminOrderListItemView {
  id: string;
  orderCode: string;
  channel: string;
  isSandbox: boolean;
  agentId: string | null;
  agentName: string | null;
  agentRequestId: string | null;
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
  agent?: Pick<Agent, 'id' | 'companyName'> | null;
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
  if (order.channel === 'AGENT') {
    const sell = new Decimal(order.sellAmount?.eq?.(0) ? order.totalAmount : order.sellAmount ?? order.totalAmount);
    return decimalToString(sell.sub(cost));
  }
  return decimalToString(paid.sub(cost).sub(fee));
}

function isSandboxOrder(order: Order): boolean {
  const trace =
    order.clientTrace && typeof order.clientTrace === 'object' && !Array.isArray(order.clientTrace)
      ? (order.clientTrace as Record<string, unknown>)
      : {};
  return trace.sandbox === true;
}

export function mapAdminOrderListItem(order: OrderListRow): AdminOrderListItemView {
  const sandbox = isSandboxOrder(order);
  const paidDisplay =
    order.channel === 'AGENT'
      ? decimalToString(
          order.sellAmount && !order.sellAmount.equals(0) ? order.sellAmount : order.totalAmount,
        )
      : decimalToString(order.customerPaid);

  return {
    id: order.id,
    orderCode: order.orderCode,
    channel: order.channel,
    isSandbox: sandbox,
    agentId: order.agentId,
    agentName: order.agent?.companyName ?? null,
    agentRequestId: order.agentRequestId,
    customerEmail: order.user?.email ?? order.guestEmail,
    customerPhone: order.user?.phone ?? order.guestPhone,
    productType: resolveProductType(order.orderItems),
    customerPaid: paidDisplay,
    providerCost: decimalToString(order.providerCost),
    gatewayFee: decimalToString(order.paymentFeeAmount),
    profit: calcProfit(order),
    paymentMethod:
      order.methodDisplayName ??
      order.paymentMethodCode ??
      (order.channel === 'AGENT' ? (sandbox ? 'Sandbox hạn mức' : 'Hạn mức đại lý') : null),
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    createdAt: order.createdAt.toISOString(),
    totalAmount: decimalToString(order.totalAmount),
  };
}

export { calcProfit };
