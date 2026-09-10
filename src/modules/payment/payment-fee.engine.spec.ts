import {
  calculateCustomerPaid,
  calculatePaymentFee,
  calculateProfit,
} from './entities/payment-fee.engine';

describe('payment-fee.engine (merchant-absorbed)', () => {
  it('SePay VA QR — fixed 300đ absorbed; customer pays sell only', () => {
    expect(calculatePaymentFee(99_000, 0, 300)).toBe(300);
    expect(calculateCustomerPaid(99_000, 0, 300)).toEqual({
      paymentFee: 300,
      totalPayment: 99_000,
    });
  });

  it('SePay Napas QR — 0.3% of charged sell (absorbed)', () => {
    expect(calculatePaymentFee(99_000, 0.3, 0)).toBe(297);
    expect(calculateCustomerPaid(99_000, 0.3, 0)).toEqual({
      paymentFee: 297,
      totalPayment: 99_000,
    });
  });

  it('MegaPay VietQR / VNPAYQR — 0.77% of sell; customer pays sell', () => {
    const { paymentFee, totalPayment } = calculateCustomerPaid(99_000, 0.77, 0);
    expect(paymentFee).toBe(762);
    expect(totalPayment).toBe(99_000);
    expect(Math.round(totalPayment * 0.0077)).toBe(762);
  });

  it('MegaPay Visa — 2.2% + 2200đ absorbed', () => {
    // fee = round(99000×0.022) + 2200 = 2178 + 2200 = 4378
    expect(calculatePaymentFee(99_000, 2.2, 2200)).toBe(4378);
    expect(calculateCustomerPaid(99_000, 2.2, 2200)).toEqual({
      paymentFee: 4378,
      totalPayment: 99_000,
    });
  });

  it('DATA package — 14.100đ sell, 0.3% absorbed', () => {
    expect(calculatePaymentFee(14_100, 0.3, 0)).toBe(42);
    expect(calculateCustomerPaid(14_100, 0.3, 0)).toEqual({
      paymentFee: 42,
      totalPayment: 14_100,
    });
  });

  it('profit = customerPaid - fee - providerCost', () => {
    expect(calculateProfit(99_000, 300, 97_500)).toBe(1200);
  });
});
