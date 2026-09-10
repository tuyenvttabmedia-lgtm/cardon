import {
  calculateCustomerPaid,
  calculatePaymentFee,
  calculateProfit,
} from './entities/payment-fee.engine';

describe('payment-fee.engine', () => {
  it('SePay VA QR — fixed 300đ (no percent)', () => {
    expect(calculatePaymentFee(99_000, 0, 300)).toBe(300);
    expect(calculateCustomerPaid(99_000, 0, 300)).toEqual({
      paymentFee: 300,
      totalPayment: 99_300,
    });
  });

  it('SePay Napas QR — 0.3% on charged amount (gross-up)', () => {
    // total = round(99000 / 0.997) = 99298; fee = 298
    expect(calculatePaymentFee(99_000, 0.3, 0)).toBe(298);
    expect(calculateCustomerPaid(99_000, 0.3, 0)).toEqual({
      paymentFee: 298,
      totalPayment: 99_298,
    });
  });

  it('MegaPay VietQR / VNPAYQR — 0.77% on charged amount (gross-up)', () => {
    // Old (wrong): fee = round(99000×0.77%) = 762, total 99762
    // Mega settlement: fee ≈ total×0.77% → gross-up so net ≈ sell
    const { paymentFee, totalPayment } = calculateCustomerPaid(99_000, 0.77, 0);
    expect(paymentFee).toBe(768);
    expect(totalPayment).toBe(99_768);
    expect(Math.round(totalPayment * 0.0077)).toBe(768);
    expect(totalPayment - paymentFee).toBe(99_000);
  });

  it('MegaPay Visa — 2.2% + 2200đ on charged amount', () => {
    // total = round((99000+2200)/0.978) = 103476; fee = 4476
    expect(calculatePaymentFee(99_000, 2.2, 2200)).toBe(4476);
    expect(calculateCustomerPaid(99_000, 2.2, 2200)).toEqual({
      paymentFee: 4476,
      totalPayment: 103_476,
    });
  });

  it('DATA package — 14.100đ sell, 0.3% gross-up', () => {
    // total = round(14100/0.997) = 14142; fee = 42 (same as sell×rate in this case)
    expect(calculatePaymentFee(14_100, 0.3, 0)).toBe(42);
    expect(calculateCustomerPaid(14_100, 0.3, 0)).toEqual({
      paymentFee: 42,
      totalPayment: 14_142,
    });
  });

  it('profit = customerPaid - fee - providerCost', () => {
    expect(calculateProfit(99_300, 300, 97_500)).toBe(1500);
  });
});
