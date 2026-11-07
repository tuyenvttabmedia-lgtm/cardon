import { buildEsimBuyerCheckoutOptions, buildEsimCheckoutOptions, displayChargeForOffer } from './esim-checkout-options';

const usd = {
  amount: '7.06',
  fxRate: '25500',
  fxRateId: 'fx-1',
  fxAsOf: '2026-11-06T00:00:00.000Z',
};

describe('eSIM checkout payment options', () => {
  it('offers SePay VND only for a Vietnam plan', () => {
    const result = buildEsimCheckoutOptions({
      market: 'VN',
      referenceAmountVnd: '180000',
      vndChargeAmount: '180000',
      usd,
      sepayReady: true,
      paypalReady: true,
    });
    expect(result.paymentOptions.map((row) => row.gateway)).toEqual(['SEPAY']);
    expect(result.paymentOptions[0]).toMatchObject({ currency: 'VND', amount: '180000', fxRate: null });
  });

  it('offers PayPal USD only for an international plan and keeps the reference price', () => {
    const result = buildEsimCheckoutOptions({
      market: 'INTL',
      referenceAmountVnd: '180000',
      vndChargeAmount: '180000',
      usd,
      sepayReady: true,
      paypalReady: true,
    });
    expect(result.paymentOptions.map((row) => `${row.gateway}:${row.currency}:${row.amount}`)).toEqual([
      'PAYPAL:USD:7.06',
    ]);
    expect(result.paymentOptions[0].referenceAmount).toBe('180000');
    expect(result.paymentOptions[0].fxRate).toBe('25500');
  });

  it('prices an English shelf in the checkout FX rate, without using a second Airalo rate', () => {
    expect(displayChargeForOffer({ market: 'INTL', sellPriceVnd: 103000, fxRate: '25500' })).toMatchObject({
      chargeCurrency: 'USD',
      chargeAmount: '4.04',
      fxRate: '25500',
    });
    expect(displayChargeForOffer({ market: 'INTL', sellPriceVnd: 103000, fxRate: '26000' }).chargeAmount).toBe('3.96');
    expect(displayChargeForOffer({ market: 'VN', sellPriceVnd: 103000, fxRate: '25500' })).toMatchObject({
      chargeCurrency: 'VND',
      chargeAmount: '103000',
      fxRate: null,
    });
    expect(displayChargeForOffer({ market: 'INTL', sellPriceVnd: 103000, fxRate: null }).chargeAmount).toBeNull();
  });

  it('offers SePay first for a Vietnam buyer and PayPal only for a foreign buyer', () => {
    const shared = {
      referenceAmountVnd: '103000',
      vndChargeAmount: '103000',
      usd,
      sepayReady: true,
      paypalReady: true,
    };
    expect(buildEsimBuyerCheckoutOptions({ ...shared, buyerMarket: 'VN' }).paymentOptions.map((row) => row.gateway)).toEqual([
      'SEPAY',
      'PAYPAL',
    ]);
    expect(buildEsimBuyerCheckoutOptions({ ...shared, buyerMarket: 'INTL' }).paymentOptions.map((row) => row.gateway)).toEqual([
      'PAYPAL',
    ]);
    expect(
      buildEsimBuyerCheckoutOptions({ ...shared, buyerMarket: 'VN', paypalReady: false }).paymentOptions.map((row) => row.gateway),
    ).toEqual(['SEPAY']);
  });

  it('drops a gateway that is not configured', () => {
    expect(
      buildEsimCheckoutOptions({
        market: 'INTL',
        referenceAmountVnd: '180000',
        vndChargeAmount: '180000',
        usd,
        sepayReady: true,
        paypalReady: false,
      }).unavailableReason,
    ).toBe('PAYPAL_UNAVAILABLE');
    expect(
      buildEsimCheckoutOptions({
        market: 'VN',
        referenceAmountVnd: '180000',
        vndChargeAmount: '180000',
        usd: null,
        sepayReady: false,
        paypalReady: true,
      }).unavailableReason,
    ).toBe('SEPAY_UNAVAILABLE');
  });

  it('does not invent a USD amount when the FX snapshot cannot be built', () => {
    const result = buildEsimCheckoutOptions({
      market: 'INTL',
      referenceAmountVnd: '180000',
      vndChargeAmount: '180000',
      usd: null,
      sepayReady: true,
      paypalReady: true,
    });
    expect(result.paymentOptions).toEqual([]);
    expect(result.unavailableReason).toBe('FX_UNAVAILABLE');
  });
});
