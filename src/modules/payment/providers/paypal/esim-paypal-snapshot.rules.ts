import { Decimal } from '@prisma/client/runtime/library';

export type EsimUsdSnapshotReject =
  | 'MISSING_SNAPSHOT'
  | 'INVALID_CURRENCY'
  | 'INVALID_AMOUNT'
  | 'FX_MISSING'
  | 'FX_EXPIRED';

export interface EsimUsdFxRow {
  status: string;
  effectiveTo: Date | null;
  observedAt: Date;
  /** Publish time. Staleness uses the later of observedAt and effectiveFrom. */
  effectiveFrom: Date;
  maxStalenessSeconds: number | null;
}

/**
 * Customer PayPal may be created only from an order that already has a USD charge
 * and a still-effective FX row. This does not convert VND and does not invent a rate.
 */
export function evaluateEsimUsdPaypalSnapshot(input: {
  chargeCurrency: string | null;
  chargeAmount: { toString(): string } | null;
  fxRateId: string | null;
  fxRateValue: { toString(): string } | null;
  fxAsOf: Date | null;
  fx: EsimUsdFxRow | null;
  now: Date;
}): { ok: true; amount: string } | { ok: false; reason: EsimUsdSnapshotReject } {
  if (
    !input.chargeCurrency ||
    input.chargeAmount == null ||
    !input.fxRateId ||
    input.fxRateValue == null ||
    !input.fxAsOf
  ) {
    return { ok: false, reason: 'MISSING_SNAPSHOT' };
  }
  if (input.chargeCurrency.trim().toUpperCase() !== 'USD') {
    return { ok: false, reason: 'INVALID_CURRENCY' };
  }

  let amount: Decimal;
  let rate: Decimal;
  try {
    amount = new Decimal(input.chargeAmount.toString());
    rate = new Decimal(input.fxRateValue.toString());
  } catch {
    return { ok: false, reason: 'INVALID_AMOUNT' };
  }
  if (!amount.isFinite() || !amount.greaterThan(0) || amount.decimalPlaces() > 2) {
    return { ok: false, reason: 'INVALID_AMOUNT' };
  }
  if (!rate.isFinite() || !rate.greaterThan(0)) {
    return { ok: false, reason: 'FX_MISSING' };
  }
  if (!input.fx) return { ok: false, reason: 'FX_MISSING' };

  const staleSeconds = input.fx.maxStalenessSeconds;
  const freshAt = Math.max(input.fx.observedAt.getTime(), input.fx.effectiveFrom.getTime());
  const expired =
    input.fx.status !== 'EFFECTIVE' ||
    (input.fx.effectiveTo != null && input.fx.effectiveTo.getTime() <= input.now.getTime()) ||
    staleSeconds == null ||
    staleSeconds <= 0 ||
    input.now.getTime() - freshAt > staleSeconds * 1000;
  if (expired) return { ok: false, reason: 'FX_EXPIRED' };
  return { ok: true, amount: amount.toFixed(2) };
}
