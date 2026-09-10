/**
 * Retail payment fee (must match API payment-fee.engine.ts).
 * CardOn absorbs gateway fees — customer total = sell price only.
 * paymentFee is the estimated settlement cost for accounting, not charged.
 */
export function calculateCustomerPaid(
  sellPrice: number,
  percentageFee: number,
  fixedFee: number,
): { paymentFee: number; totalPayment: number } {
  const sell = Math.round(Math.max(0, sellPrice));
  const fixed = Math.round(Math.max(0, fixedFee));
  const rate = Math.max(0, percentageFee) / 100;

  if (rate >= 1) {
    throw new Error('percentageFee must be less than 100');
  }

  const paymentFee = Math.round(sell * rate) + fixed;
  return { paymentFee, totalPayment: sell };
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
