import { describe, expect, it } from 'vitest';
import {
  esimBuyerMarket,
  esimMarketForGateway,
  esimOrderCreateBody,
  esimPayLabel,
  esimReferenceNote,
  esimShelfPrice,
  filterEsimQuotedOptions,
} from './esim-checkout-options';

describe('eSIM checkout labels', () => {
  const paypal = {
    currency: 'USD' as const,
    amount: '7.06',
    referenceAmount: '180000',
    fxRate: '25500',
  };
  const sepay = {
    currency: 'VND' as const,
    amount: '180000',
    referenceAmount: '180000',
    fxRate: null,
  };

  it('labels PayPal in USD and SePay in VND in both languages', () => {
    expect(esimPayLabel('vi', paypal)).toBe('Thanh toán $7.06 USD');
    expect(esimPayLabel('en', paypal)).toBe('Pay $7.06 USD');
    expect(esimPayLabel('vi', sepay)).toBe('Thanh toán 180.000 ₫');
    expect(esimPayLabel('en', sepay)).toBe('Pay 180,000 VND');
  });

  it('shows USD on the English shelf and VND on the Vietnamese shelf', () => {
    const offer = { sellPriceVnd: 103000, chargeCurrency: 'USD', chargeAmount: '4.04' };
    expect(esimShelfPrice('en', offer)).toBe('$4.04');
    expect(esimShelfPrice('vi', offer)).toContain('103');
    expect(esimShelfPrice('en', { sellPriceVnd: 103000, chargeCurrency: null, chargeAmount: null })).toContain('103');
  });

  it('shows the server FX note only for a USD quote', () => {
    expect(esimReferenceNote('vi', paypal)).toBe('Giá tham khảo 180.000 ₫ · Tỷ giá 1 USD = 25.500 VND');
    expect(esimReferenceNote('en', paypal)).toBe('Reference price 180,000 VND · Exchange rate 1 USD = 25,500 VND');
    expect(esimReferenceNote('en', sepay)).toBeNull();
  });

  it('does not send amount, currency or an FX rate when creating the order', () => {
    const body = esimOrderCreateBody({
      variantId: 'variant-1',
      paymentMethodCode: 'PAYPAL',
      market: 'INTL',
      locale: 'vi',
    });
    expect(body).not.toHaveProperty('amount');
    expect(body).not.toHaveProperty('currency');
    expect(body).not.toHaveProperty('fxRate');
    expect(body).not.toHaveProperty('chargeAmount');
  });

  it('keeps the quoted gateway when the shopper has not created an order yet', () => {
    const options = [
      { gateway: 'PAYPAL' as const, currency: 'USD' as const, amount: '7.06' },
    ];
    const selected = options.find((row) => row.gateway === 'PAYPAL') ?? options[0];
    expect(esimPayLabel('vi', selected)).toContain('USD');
    expect(esimPayLabel('en', selected)).not.toContain('VND');
  });

  it('does not drop quote options while payment methods are still loading', () => {
    const options = [
      { gateway: 'SEPAY' },
      { gateway: 'PAYPAL' },
    ];
    expect(filterEsimQuotedOptions(options, [], false)).toEqual([]);
    expect(
      filterEsimQuotedOptions(
        options,
        [
          { enabled: true, gatewayCode: 'SEPAY' },
          { enabled: true, gatewayCode: 'PAYPAL' },
        ],
        true,
      ).map((row) => row.gateway),
    ).toEqual(['SEPAY', 'PAYPAL']);
  });

  it('maps the gateway to the order market and prefers buyerMarket on the quote', () => {
    expect(esimMarketForGateway('PAYPAL')).toBe('INTL');
    expect(esimMarketForGateway('SEPAY')).toBe('VN');
    expect(esimBuyerMarket({ market: 'VN', buyerMarket: 'INTL' })).toBe('INTL');
    expect(esimBuyerMarket({ market: 'VN' })).toBe('VN');
  });
});
