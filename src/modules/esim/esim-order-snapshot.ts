import { Decimal } from '@prisma/client/runtime/library';

export const ESIM_SNAPSHOT_CURRENCY_VND = 'VND' as const;

export interface EsimVndPriceSnapshot {
  catalogCurrency: typeof ESIM_SNAPSHOT_CURRENCY_VND;
  catalogAmount: Decimal;
  chargeCurrency: typeof ESIM_SNAPSHOT_CURRENCY_VND;
  chargeAmount: Decimal;
  esimMarket: 'VN' | 'INTL';
  pricingLockedAt: Date;
}

/**
 * Phase 1 locks the VND catalog price and the VND amount already stored on the order.
 * It does not convert currency and does not read a client amount.
 * PayPal admin-test USD stays in clientTrace. totalAmount is unchanged.
 */
export function buildEsimVndPriceSnapshot(input: {
  sellAmount: Decimal;
  chargeAmount: Decimal;
  market: 'VN' | 'INTL';
  lockedAt: Date;
}): EsimVndPriceSnapshot {
  return {
    catalogCurrency: ESIM_SNAPSHOT_CURRENCY_VND,
    catalogAmount: input.sellAmount,
    chargeCurrency: ESIM_SNAPSHOT_CURRENCY_VND,
    chargeAmount: input.chargeAmount,
    esimMarket: input.market,
    pricingLockedAt: input.lockedAt,
  };
}
