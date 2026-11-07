import { Decimal } from '@prisma/client/runtime/library';

/** Manual source. Automatic sources can be added later without changing this pair. */
export const MANUAL_USD_VND_SOURCE = 'MANUAL_USD_VND';

export const FX_BAND_RATIO = new Decimal('0.02');

export type FxBand = 'WITHIN_BAND' | 'OVER_BAND';

export type FxCheckoutReject = 'FX_MISSING' | 'FX_CONFLICT' | 'FX_EXPIRED' | 'FX_STALE';

export interface CheckoutFxRow {
  id: string;
  status: string;
  rate: { toString(): string };
  observedAt: Date;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  maxStalenessSeconds: number | null;
  baseCurrency: string;
  quoteCurrency: string;
}

/**
 * 1 USD = X VND. A move of more than 2% in either direction needs approval.
 * Equality at exactly 2% stays inside the band.
 */
export function fxBand(current: { toString(): string } | null, next: { toString(): string }): FxBand {
  if (!current) return 'WITHIN_BAND';
  const currentRate = new Decimal(current.toString());
  const nextRate = new Decimal(next.toString());
  if (!currentRate.gt(0) || !nextRate.gt(0)) return 'OVER_BAND';
  const ratio = nextRate.minus(currentRate).abs().div(currentRate);
  return ratio.gt(FX_BAND_RATIO) ? 'OVER_BAND' : 'WITHIN_BAND';
}

export function parseManualFxRate(raw: string): { ok: true; rate: Decimal } | { ok: false; reason: string } {
  let rate: Decimal;
  try {
    rate = new Decimal(raw.trim());
  } catch {
    return { ok: false, reason: 'INVALID_RATE' };
  }
  if (!rate.isFinite() || !rate.gt(0) || rate.decimalPlaces() > 8) {
    return { ok: false, reason: 'INVALID_RATE' };
  }
  return { ok: true, rate };
}

export function selectCheckoutFx(
  rows: CheckoutFxRow[],
  now: Date,
): { ok: true; row: CheckoutFxRow; rate: Decimal } | { ok: false; reason: FxCheckoutReject } {
  const effective = rows.filter(
    (row) =>
      row.status === 'EFFECTIVE' && row.baseCurrency === 'USD' && row.quoteCurrency === 'VND',
  );
  if (effective.length === 0) return { ok: false, reason: 'FX_MISSING' };
  const live = effective.filter((row) => !row.effectiveTo || row.effectiveTo.getTime() > now.getTime());
  if (live.length === 0) return { ok: false, reason: 'FX_EXPIRED' };
  if (live.length > 1) return { ok: false, reason: 'FX_CONFLICT' };
  const row = live[0];
  const staleSeconds = row.maxStalenessSeconds;
  if (staleSeconds == null || staleSeconds <= 0) return { ok: false, reason: 'FX_STALE' };
  // Publishing starts a new window. An older observation date must not blank checkout.
  const freshAt = Math.max(row.observedAt.getTime(), row.effectiveFrom.getTime());
  if (now.getTime() - freshAt > staleSeconds * 1000) {
    return { ok: false, reason: 'FX_EXPIRED' };
  }
  const parsed = parseManualFxRate(row.rate.toString());
  if (!parsed.ok) return { ok: false, reason: 'FX_STALE' };
  return { ok: true, row, rate: parsed.rate };
}

/** Catalog sell price is VND. Customer charge is that amount divided by VND per 1 USD. */
export function convertVndSellToUsd(
  amountVnd: { toString(): string },
  vndPerUsd: { toString(): string },
): { ok: true; usd: Decimal } | { ok: false; reason: 'INVALID_AMOUNT' | 'INVALID_RATE' } {
  const rate = parseManualFxRate(vndPerUsd.toString());
  if (!rate.ok) return { ok: false, reason: 'INVALID_RATE' };
  let amount: Decimal;
  try {
    amount = new Decimal(amountVnd.toString());
  } catch {
    return { ok: false, reason: 'INVALID_AMOUNT' };
  }
  if (!amount.isFinite() || !amount.gt(0)) return { ok: false, reason: 'INVALID_AMOUNT' };
  const usd = amount.div(rate.rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (usd.lt('0.01')) return { ok: false, reason: 'INVALID_AMOUNT' };
  return { ok: true, usd };
}
