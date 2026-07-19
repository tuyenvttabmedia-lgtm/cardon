import {
  calculateCustomerPaid,
  calculatePaymentFee,
  calculateProfit,
} from './entities/payment-fee.engine';

describe('payment-fee.engine', () => {
  it('SePay VA QR — fixed 300đ', () => {
    expect(calculatePaymentFee(99_000, 0, 300)).toBe(300);
    expect(calculateCustomerPaid(99_000, 0, 300)).toEqual({
      paymentFee: 300,
      totalPayment: 99_300,
    });
  });

  it('SePay Napas QR — 0.3%', () => {
    expect(calculatePaymentFee(99_000, 0.3, 0)).toBe(297);
    expect(calculateCustomerPaid(99_000, 0.3, 0)).toEqual({
      paymentFee: 297,
      totalPayment: 99_297,
    });
  });

  it('MegaPay Visa — 2.2% + 2200đ', () => {
    expect(calculatePaymentFee(99_000, 2.2, 2200)).toBe(4378);
  });

  it('DATA package — 14.100đ sell, 0.3%', () => {
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
