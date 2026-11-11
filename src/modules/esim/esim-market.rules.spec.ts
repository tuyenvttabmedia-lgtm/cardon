import { evaluateEsimMarketPayment, gatewaysForEsimMarket } from './esim-market.rules';

describe('evaluateEsimMarketPayment', () => {
  it('allows VN + VND + SEPAY or MEGAPAY', () => {
    expect(
      evaluateEsimMarketPayment({ market: 'VN', currency: 'VND', gateway: 'SEPAY', homeService: 'ESIM' }),
    ).toEqual({ ok: true, market: 'VN', currency: 'VND', gateway: 'SEPAY' });
    expect(
      evaluateEsimMarketPayment({ market: 'VN', currency: 'VND', gateway: 'MEGAPAY', homeService: 'ESIM' }),
    ).toEqual({ ok: true, market: 'VN', currency: 'VND', gateway: 'MEGAPAY' });
  });

  it('allows INTL + USD + PAYPAL', () => {
    expect(
      evaluateEsimMarketPayment({ market: 'INTL', currency: 'usd', gateway: 'paypal', homeService: 'ESIM' }),
    ).toEqual({ ok: true, market: 'INTL', currency: 'USD', gateway: 'PAYPAL' });
  });

  it('rejects VN with PayPal and INTL with SePay', () => {
    expect(
      evaluateEsimMarketPayment({ market: 'VN', currency: 'VND', gateway: 'PAYPAL' }).ok,
    ).toBe(false);
    expect(
      evaluateEsimMarketPayment({ market: 'INTL', currency: 'USD', gateway: 'SEPAY' }).ok,
    ).toBe(false);
  });

  it('rejects non-eSIM home service', () => {
    expect(
      evaluateEsimMarketPayment({
        market: 'VN',
        currency: 'VND',
        gateway: 'SEPAY',
        homeService: 'GAME_CARD',
      }),
    ).toEqual({ ok: false, reason: 'NOT_ESIM_PRODUCT' });
  });

  it('lists gateways per market', () => {
    expect(gatewaysForEsimMarket('VN')).toEqual(['SEPAY', 'MEGAPAY']);
    expect(gatewaysForEsimMarket('INTL')).toEqual(['PAYPAL']);
  });
});
