import { describe, expect, it } from 'vitest';
import { paymentMethodsForCheckout, paypalReturnPresentation } from './esim-paypal';

const methods = [
  { methodCode: 'VIETQR', gatewayCode: 'SEPAY', enabled: true },
  { methodCode: 'ZALOPAY', gatewayCode: 'MEGAPAY', enabled: true, esimEnabled: true },
  { methodCode: 'VNPAYQR', gatewayCode: 'MEGAPAY', enabled: false, esimEnabled: false },
  { methodCode: 'PAYPAL', gatewayCode: 'PAYPAL', enabled: true },
];

describe('eSIM PayPal checkout visibility', () => {
  it('shows PayPal only for an international eSIM', () => {
    expect(paymentMethodsForCheckout({ methods, isEsim: true, market: 'INTL' }).map((m) => m.gatewayCode)).toEqual([
      'PAYPAL',
    ]);
  });

  it('allows SePay, armed MegaPay, and PayPal for a Vietnam eSIM buyer, and hides PayPal on cards', () => {
    expect(paymentMethodsForCheckout({ methods, isEsim: true, market: 'VN' }).map((m) => m.methodCode)).toEqual([
      'VIETQR',
      'ZALOPAY',
      'PAYPAL',
    ]);
    expect(
      paymentMethodsForCheckout({ methods, isEsim: false, market: 'VN' }).map((m) => m.methodCode),
    ).toEqual(['VIETQR', 'ZALOPAY']);
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
