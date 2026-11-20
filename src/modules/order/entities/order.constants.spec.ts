import {
  DEFAULT_PAYMENT_TIMEOUT_MINUTES,
  EXTERNAL_QR_MIN_TIMEOUT_MINUTES,
  requiresExtendedPaymentWindow,
} from './order.constants';

describe('order payment window constants', () => {
  it('defaults the B2C payment window to the MegaPay session floor', () => {
    expect(DEFAULT_PAYMENT_TIMEOUT_MINUTES).toBe(30);
    expect(DEFAULT_PAYMENT_TIMEOUT_MINUTES).toBe(
      EXTERNAL_QR_MIN_TIMEOUT_MINUTES,
    );
  });

  it('keeps MegaPay VA and VNPAYQR orders alive for the gateway session', () => {
    expect(EXTERNAL_QR_MIN_TIMEOUT_MINUTES).toBe(30);
    expect(requiresExtendedPaymentWindow('DEPOSIT_CODE')).toBe(true);
    expect(requiresExtendedPaymentWindow('VNPAYQR')).toBe(true);
  });

  it('does not extend unrelated gateway methods', () => {
    expect(requiresExtendedPaymentWindow('ZALOPAY')).toBe(false);
    expect(requiresExtendedPaymentWindow(null)).toBe(false);
  });
});
