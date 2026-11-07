import { describe, expect, it } from 'vitest';
import { paymentMethodsForCheckout, paypalReturnPresentation } from './esim-paypal';

const methods = [
  { methodCode: 'VIETQR', gatewayCode: 'SEPAY', enabled: true },
  { methodCode: 'ZALOPAY', gatewayCode: 'MEGAPAY', enabled: true },
  { methodCode: 'PAYPAL', gatewayCode: 'PAYPAL', enabled: true },
];

describe('eSIM PayPal checkout visibility', () => {
  it('shows PayPal only for an international eSIM', () => {
    expect(paymentMethodsForCheckout({ methods, isEsim: true, market: 'INTL' }).map((m) => m.gatewayCode)).toEqual([
      'PAYPAL',
    ]);
  });

  it('allows SePay and PayPal for a Vietnam eSIM buyer, and hides PayPal on cards', () => {
    expect(paymentMethodsForCheckout({ methods, isEsim: true, market: 'VN' }).map((m) => m.gatewayCode)).toEqual([
      'SEPAY',
      'PAYPAL',
    ]);
    expect(
      paymentMethodsForCheckout({ methods, isEsim: false, market: 'VN' }).map((m) => m.gatewayCode),
    ).toEqual(['SEPAY', 'MEGAPAY']);
  });

  it('does not treat the PayPal return query as payment success', () => {
    expect(paypalReturnPresentation({ backendStatus: null })).toBe('unconfirmed');
    expect(paypalReturnPresentation({ backendStatus: 'PENDING' })).toBe('pending');
    expect(paypalReturnPresentation({ backendStatus: 'SUCCESS' })).toBe('confirmed');
  });

  it('keeps cancel distinct from pending unless sync already shows paid', () => {
    expect(paypalReturnPresentation({ backendStatus: 'PENDING', cancelled: true })).toBe('cancelled');
    expect(paypalReturnPresentation({ backendStatus: null, cancelled: true })).toBe('cancelled');
    expect(paypalReturnPresentation({ backendStatus: 'SUCCESS', cancelled: true })).toBe('confirmed');
  });
});
