/**
 * Transparent payment gateway fee (must match API payment-fee.engine.ts).
 * Percent fee is charged on totalPayment (gateway settlement base), not sellPrice alone.
 */
export function calculateCustomerPaid(
  sellPrice: number,
  percentageFee: number,
  fixedFee: number,
): { paymentFee: number; totalPayment: number } {
  const sell = Math.max(0, sellPrice);
  const fixed = Math.max(0, fixedFee);
  const rate = Math.max(0, percentageFee) / 100;

  if (rate <= 0) {
    const paymentFee = Math.round(fixed);
    return { paymentFee, totalPayment: Math.round(sell) + paymentFee };
  }

  if (rate >= 1) {
    throw new Error('percentageFee must be less than 100');
  }

  const totalPayment = Math.round((sell + fixed) / (1 - rate));
  const paymentFee = totalPayment - Math.round(sell);
  return { paymentFee, totalPayment };
}

export function calculatePaymentFee(
  sellPrice: number,
  percentageFee: number,
  fixedFee: number,
): number {
  return calculateCustomerPaid(sellPrice, percentageFee, fixedFee).paymentFee;
}

export function calculateProfit(
  customerPaid: number,
  paymentFee: number,
  providerCost: number,
): number {
  return customerPaid - paymentFee - providerCost;
}
