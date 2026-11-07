/**
 * eSIM market routing. Cards / topup are out of scope.
 * Truth = market + currency + gateway (not IP alone).
 */

export type EsimMarket = 'VN' | 'INTL';

export type EsimCheckoutGateway = 'SEPAY' | 'PAYPAL';

export interface EsimMarketRuleInput {
  market: EsimMarket;
  currency: string;
  gateway: string;
  homeService?: string;
}

export type EsimMarketRuleResult =
  | { ok: true; market: EsimMarket; currency: 'VND' | 'USD'; gateway: EsimCheckoutGateway }
  | { ok: false; reason: string };

/** Allowed pairs for eSIM only. Reject every other combination. */
export function evaluateEsimMarketPayment(input: EsimMarketRuleInput): EsimMarketRuleResult {
  if (input.homeService && input.homeService !== 'ESIM') {
    return { ok: false, reason: 'NOT_ESIM_PRODUCT' };
  }
  const currency = input.currency.trim().toUpperCase();
  const gateway = input.gateway.trim().toUpperCase();

  if (input.market === 'VN') {
    if (currency !== 'VND') {
      return { ok: false, reason: 'VN_REQUIRES_VND' };
    }
    if (gateway !== 'SEPAY') {
      return { ok: false, reason: 'VN_REQUIRES_SEPAY' };
    }
    return { ok: true, market: 'VN', currency: 'VND', gateway: 'SEPAY' };
  }

  if (input.market === 'INTL') {
    if (currency !== 'USD') {
      return { ok: false, reason: 'INTL_REQUIRES_USD' };
    }
    if (gateway !== 'PAYPAL') {
      return { ok: false, reason: 'INTL_REQUIRES_PAYPAL' };
    }
    return { ok: true, market: 'INTL', currency: 'USD', gateway: 'PAYPAL' };
  }

  return { ok: false, reason: 'UNKNOWN_MARKET' };
}

export function gatewaysForEsimMarket(market: EsimMarket): EsimCheckoutGateway[] {
  return market === 'VN' ? ['SEPAY'] : ['PAYPAL'];
}

/** Package destination, not the shopper's language, IP, or payment method. */
export function marketFromEsimPackage(input: {
  countryIso?: string | null;
  destinationKey?: string | null;
}): EsimMarket {
  const iso = (input.countryIso ?? '').trim().toUpperCase();
  const key = (input.destinationKey ?? '').trim().toLowerCase();
  if (iso === 'VN' || key === 'vn' || key === 'vietnam') return 'VN';
  return 'INTL';
}
