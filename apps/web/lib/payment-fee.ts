export function calculatePaymentFee(
  sellPrice: number,
  percentageFee: number,
  fixedFee: number,
): number {
  const base = sellPrice * (percentageFee / 100) + fixedFee;
  return Math.round(base);
}

export function calculateCustomerPaid(
  sellPrice: number,
  percentageFee: number,
  fixedFee: number,
): { paymentFee: number; totalPayment: number } {
  const paymentFee = calculatePaymentFee(sellPrice, percentageFee, fixedFee);
  return {
    paymentFee,
    totalPayment: sellPrice + paymentFee,
  };
}

export function calculateProfit(
  customerPaid: number,
  paymentFee: number,
  providerCost: number,
): number {
  return customerPaid - paymentFee - providerCost;
}
