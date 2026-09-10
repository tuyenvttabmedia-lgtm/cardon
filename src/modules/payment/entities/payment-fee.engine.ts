/**
 * Retail payment fee accounting (merchant-absorbed).
 *
 * Customer pays website sell price only. CardOn absorbs gateway settlement
 * fees (MegaPay %, SePay fixed, etc.). paymentFee is an estimate of what
 * the gateway will deduct from the charged amount — used for profit /
 * finance snapshots, never added to customer total.
 *
 *   totalPayment = round(sellPrice)
 *   paymentFee   = round(sellPrice × rate) + round(fixed)
 *   profit       = customerPaid − paymentFee − providerCost
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
