import { readOrderCheckoutLocale, storefrontCheckoutUrl } from './storefront-checkout-url';

describe('storefront checkout URLs', () => {
  it('reads locale from clientTrace and defaults to vi', () => {
    expect(readOrderCheckoutLocale({ locale: 'en' })).toBe('en');
    expect(readOrderCheckoutLocale({ locale: 'vi' })).toBe('vi');
    expect(readOrderCheckoutLocale({})).toBe('vi');
    expect(readOrderCheckoutLocale(null)).toBe('vi');
  });

  it('prefixes English paths and keeps Vietnamese bare', () => {
    expect(
      storefrontCheckoutUrl('https://cardon.vn', 'en', '/checkout/paypal/return', { orderId: 'o1' }),
    ).toBe('https://cardon.vn/en/checkout/paypal/return?orderId=o1');
    expect(
      storefrontCheckoutUrl('https://cardon.vn/', 'vi', '/checkout/result', { orderId: 'o1' }),
    ).toBe('https://cardon.vn/checkout/result?orderId=o1');
    expect(
      storefrontCheckoutUrl('https://cardon.vn', 'en', '/orders/ord-1', { payment: 'success' }),
    ).toBe('https://cardon.vn/en/orders/ord-1?payment=success');
  });

  it('rejects path open-redirect tricks', () => {
    expect(() => storefrontCheckoutUrl('https://cardon.vn', 'vi', '//evil.com')).toThrow();
    expect(() => storefrontCheckoutUrl('https://cardon.vn', 'vi', '/orders/../admin')).toThrow();
    expect(() => storefrontCheckoutUrl('https://cardon.vn', 'vi', '/orders/x?x=1')).toThrow();
  });
});
