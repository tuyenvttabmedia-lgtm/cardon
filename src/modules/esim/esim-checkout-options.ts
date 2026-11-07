import { convertVndSellToUsd } from '../fx/fx-rate.rules';

export type EsimCheckoutGateway = 'SEPAY' | 'PAYPAL';

export interface EsimCheckoutOption {
  gateway: EsimCheckoutGateway;
  currency: 'VND' | 'USD';
  amount: string;
  referenceCurrency: 'VND';
  referenceAmount: string;
  fxRate: string | null;
  fxRateId: string | null;
  fxAsOf: string | null;
}

export type EsimCheckoutUnavailable = 'SEPAY_UNAVAILABLE' | 'PAYPAL_UNAVAILABLE' | 'FX_UNAVAILABLE';

/**
 * One gateway per package market. Language does not add a currency.
 * An international plan stays on the USD snapshot, so SePay is omitted.
 * A Vietnam plan stays on the VND snapshot, so PayPal is omitted.
 */
export function buildEsimCheckoutOptions(input: {
  market: 'VN' | 'INTL';
  referenceAmountVnd: string;
  vndChargeAmount: string;
  usd: { amount: string; fxRate: string; fxRateId: string; fxAsOf: string } | null;
  sepayReady: boolean;
  paypalReady: boolean;
}): { paymentOptions: EsimCheckoutOption[]; unavailableReason: EsimCheckoutUnavailable | null } {
  const referenceAmount = input.referenceAmountVnd;
  if (input.market === 'VN') {
    if (!input.sepayReady || !input.vndChargeAmount) {
      return { paymentOptions: [], unavailableReason: 'SEPAY_UNAVAILABLE' };
    }
    return {
      unavailableReason: null,
      paymentOptions: [
        {
          gateway: 'SEPAY',
          currency: 'VND',
          amount: input.vndChargeAmount,
          referenceCurrency: 'VND',
          referenceAmount,
          fxRate: null,
          fxRateId: null,
          fxAsOf: null,
        },
      ],
    };
  }
  if (!input.paypalReady) {
    return { paymentOptions: [], unavailableReason: 'PAYPAL_UNAVAILABLE' };
  }
  if (!input.usd?.amount || !input.usd.fxRate) {
    return { paymentOptions: [], unavailableReason: 'FX_UNAVAILABLE' };
  }
  return {
    unavailableReason: null,
    paymentOptions: [
      {
        gateway: 'PAYPAL',
        currency: 'USD',
        amount: input.usd.amount,
        referenceCurrency: 'VND',
        referenceAmount,
        fxRate: input.usd.fxRate,
        fxRateId: input.usd.fxRateId,
        fxAsOf: input.usd.fxAsOf,
      },
    ],
  };
}

/**
 * Buyer location chooses which pairs are offered. The package country does not.
 * Vietnam (and an unknown edge, which the storefront treats as Vietnam) can pay
 * SePay VND or PayPal USD. A confirmed foreign country gets PayPal USD only.
 */
export function buildEsimBuyerCheckoutOptions(input: {
  buyerMarket: 'VN' | 'INTL';
  referenceAmountVnd: string;
  vndChargeAmount: string;
  usd: { amount: string; fxRate: string; fxRateId: string; fxAsOf: string } | null;
  sepayReady: boolean;
  paypalReady: boolean;
}): { paymentOptions: EsimCheckoutOption[]; unavailableReason: EsimCheckoutUnavailable | null } {
  const referenceAmount = input.referenceAmountVnd;
  const sepay: EsimCheckoutOption | null =
    input.sepayReady && input.vndChargeAmount
      ? {
          gateway: 'SEPAY',
          currency: 'VND',
          amount: input.vndChargeAmount,
          referenceCurrency: 'VND',
          referenceAmount,
          fxRate: null,
          fxRateId: null,
          fxAsOf: null,
        }
      : null;
  const paypal: EsimCheckoutOption | null =
    input.paypalReady && input.usd?.amount && input.usd.fxRate
      ? {
          gateway: 'PAYPAL',
          currency: 'USD',
          amount: input.usd.amount,
          referenceCurrency: 'VND',
          referenceAmount,
          fxRate: input.usd.fxRate,
          fxRateId: input.usd.fxRateId,
          fxAsOf: input.usd.fxAsOf,
        }
      : null;
  if (input.buyerMarket === 'INTL') {
    if (!input.paypalReady) return { paymentOptions: [], unavailableReason: 'PAYPAL_UNAVAILABLE' };
    if (!paypal) return { paymentOptions: [], unavailableReason: 'FX_UNAVAILABLE' };
    return { paymentOptions: [paypal], unavailableReason: null };
  }
  const paymentOptions = [sepay, paypal].filter((option): option is EsimCheckoutOption => option !== null);
  if (paymentOptions.length > 0) return { paymentOptions, unavailableReason: null };
  if (!input.sepayReady && !input.paypalReady) return { paymentOptions: [], unavailableReason: 'SEPAY_UNAVAILABLE' };
  if (!input.paypalReady || !input.usd) return { paymentOptions: [], unavailableReason: input.paypalReady ? 'FX_UNAVAILABLE' : 'PAYPAL_UNAVAILABLE' };
  return { paymentOptions: [], unavailableReason: 'SEPAY_UNAVAILABLE' };
}

/** Shelf price for an international plan. Uses the checkout FX rate, not the Airalo import rate. */
export function displayChargeForOffer(input: {
  market: 'VN' | 'INTL';
  sellPriceVnd: number;
  fxRate: string | null;
}): {
  market: 'VN' | 'INTL';
  chargeCurrency: 'VND' | 'USD' | null;
  chargeAmount: string | null;
  fxRate: string | null;
} {
  if (input.market === 'VN') {
    return {
      market: 'VN',
      chargeCurrency: 'VND',
      chargeAmount: String(Math.round(input.sellPriceVnd)),
      fxRate: null,
    };
  }
  if (!input.fxRate) {
    return { market: 'INTL', chargeCurrency: null, chargeAmount: null, fxRate: null };
  }
  const converted = convertVndSellToUsd(input.sellPriceVnd, input.fxRate);
  if (!converted.ok) {
    return { market: 'INTL', chargeCurrency: null, chargeAmount: null, fxRate: null };
  }
  return {
    market: 'INTL',
    chargeCurrency: 'USD',
    chargeAmount: converted.usd.toFixed(2),
    fxRate: input.fxRate,
  };
}
