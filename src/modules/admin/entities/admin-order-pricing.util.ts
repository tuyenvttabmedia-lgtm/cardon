import { Order } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { decimalToString } from '../../order/entities/order.mapper';

/** Use persisted order pricing snapshot; derive from line items when legacy rows are zero. */
export function resolveOrderPricingSnapshot(order: Order) {
  const hasSnapshot =
    order.faceValue.gt(0) ||
    order.sellAmount.gt(0) ||
    order.customerPaid.gt(0);

  if (hasSnapshot) {
    return {
      faceValue: decimalToString(order.faceValue),
      sellAmount: decimalToString(order.sellAmount),
      discountAmount: decimalToString(order.discountAmount),
      gatewayFee: decimalToString(order.paymentFeeAmount),
      paymentFeeAmount: decimalToString(order.paymentFeeAmount),
      customerPaid: decimalToString(order.customerPaid),
      providerCost: decimalToString(order.providerCost),
      profit: decimalToString(order.profit),
    };
  }

  const sellAmount = order.totalAmount;
  const discountAmount = order.discountAmount;
  const faceValue = sellAmount.add(discountAmount);

  return {
    faceValue: decimalToString(faceValue),
    sellAmount: decimalToString(sellAmount),
    discountAmount: decimalToString(discountAmount),
    gatewayFee: decimalToString(order.paymentFeeAmount),
    paymentFeeAmount: decimalToString(order.paymentFeeAmount),
    customerPaid: decimalToString(
      order.customerPaid.gt(0) ? order.customerPaid : order.totalAmount.add(order.paymentFeeAmount),
    ),
    providerCost: decimalToString(order.providerCost),
    profit: decimalToString(order.profit),
  };
}

export function lineSellPrice(item: { unitPrice: Decimal | number | string }): string {
  return decimalToString(item.unitPrice);
}
