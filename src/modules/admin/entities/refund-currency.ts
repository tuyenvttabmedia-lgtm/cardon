import {
  PaymentGatewayCode,
  RefundCurrency,
  RefundIntendedMethod,
} from '@prisma/client';

/** Payment has no currency column. PayPal is USD; in-scope others are VND. */
export function inferRefundCurrency(gateway: PaymentGatewayCode): RefundCurrency {
  return gateway === PaymentGatewayCode.PAYPAL
    ? RefundCurrency.USD
    : RefundCurrency.VND;
}

export function defaultRefundIntendedMethod(
  gateway: PaymentGatewayCode,
): RefundIntendedMethod {
  if (gateway === PaymentGatewayCode.PAYPAL) {
    return RefundIntendedMethod.PAYPAL_REFUND;
  }
  return RefundIntendedMethod.BANK_PAYOUT;
}
