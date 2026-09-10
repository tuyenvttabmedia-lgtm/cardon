/**
 * Transparent payment gateway fee calculation.
 *
 * Gateways (MegaPay, etc.) typically take percentage fee on the **charged
 * amount** (what the customer pays), not on website sell price alone:
 *
 *   fee ≈ totalPayment × rate + fixed
 *   totalPayment = sellPrice + fee
 *   ⇒ totalPayment = round((sellPrice + fixed) / (1 − rate))
 *   ⇒ paymentFee = totalPayment − sellPrice
 *
 * Fixed-only methods (rate = 0): paymentFee = fixed, total = sell + fixed.
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
