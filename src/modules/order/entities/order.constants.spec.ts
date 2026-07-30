import {
  EXTERNAL_QR_MIN_TIMEOUT_MINUTES,
  requiresExtendedPaymentWindow,
} from './order.constants';

describe('order payment window constants', () => {
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
