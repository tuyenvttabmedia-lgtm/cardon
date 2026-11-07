import { Decimal } from '@prisma/client/runtime/library';
import { convertVndSellToUsd, fxBand, parseManualFxRate, selectCheckoutFx, type CheckoutFxRow } from './fx-rate.rules';

function row(overrides: Partial<CheckoutFxRow> = {}): CheckoutFxRow {
  return {
    id: 'fx-1',
    status: 'EFFECTIVE',
    rate: new Decimal('25000'),
    observedAt: new Date('2026-11-06T10:00:00.000Z'),
    effectiveFrom: new Date('2026-11-06T10:00:00.000Z'),
    effectiveTo: null,
    maxStalenessSeconds: 86_400,
    baseCurrency: 'USD',
    quoteCurrency: 'VND',
    ...overrides,
  };
}

describe('manual FX rules', () => {
  const now = new Date('2026-11-06T12:00:00.000Z');

  it('parses a positive VND-per-USD rate and rejects anything else', () => {
    expect(parseManualFxRate('25000.5').ok).toBe(true);
    expect(parseManualFxRate('0').ok).toBe(false);
    expect(parseManualFxRate('-1').ok).toBe(false);
    expect(parseManualFxRate('abc').ok).toBe(false);
    expect(parseManualFxRate('1.123456789').ok).toBe(false);
  });

  it('treats a move of exactly 2% as inside the band and anything above as over', () => {
    expect(fxBand(null, new Decimal('25000'))).toBe('WITHIN_BAND');
    expect(fxBand(new Decimal('25000'), new Decimal('25500'))).toBe('WITHIN_BAND');
    expect(fxBand(new Decimal('25000'), new Decimal('24500'))).toBe('WITHIN_BAND');
    expect(fxBand(new Decimal('25000'), new Decimal('25500.01'))).toBe('OVER_BAND');
    expect(fxBand(new Decimal('25000'), new Decimal('24499.99'))).toBe('OVER_BAND');
  });

  it('accepts one live rate and rejects a missing, expired, stale, or conflicting rate', () => {
    expect(selectCheckoutFx([row()], now).ok).toBe(true);
    expect(selectCheckoutFx([], now)).toEqual({ ok: false, reason: 'FX_MISSING' });
    expect(
      selectCheckoutFx([row({ effectiveTo: new Date('2026-11-06T11:00:00.000Z') })], now).ok,
    ).toBe(false);
    expect(
      selectCheckoutFx([row({ effectiveTo: new Date('2026-11-06T11:00:00.000Z') })], now),
    ).toEqual({ ok: false, reason: 'FX_EXPIRED' });
    expect(
      selectCheckoutFx([
        row({
          observedAt: new Date('2026-11-05T11:00:00.000Z'),
          effectiveFrom: new Date('2026-11-05T11:00:00.000Z'),
        }),
      ], now),
    ).toEqual({ ok: false, reason: 'FX_EXPIRED' });
    expect(
      selectCheckoutFx([
        row({
          observedAt: new Date('2026-11-01T04:11:00.000Z'),
          effectiveFrom: new Date('2026-11-06T11:00:00.000Z'),
        }),
      ], now).ok,
    ).toBe(true);
    expect(selectCheckoutFx([row({ maxStalenessSeconds: 0 })], now)).toEqual({
      ok: false,
      reason: 'FX_STALE',
    });
    expect(selectCheckoutFx([row(), row({ id: 'fx-2' })], now)).toEqual({
      ok: false,
      reason: 'FX_CONFLICT',
    });
    expect(selectCheckoutFx([row({ status: 'DRAFT' })], now)).toEqual({
      ok: false,
      reason: 'FX_MISSING',
    });
  });

  it('rounds USD half up to 2 decimal places and rejects a charge under 0.01', () => {
    const exact = convertVndSellToUsd(new Decimal('100000'), new Decimal('25000'));
    expect(exact.ok && exact.usd.toFixed(2)).toBe('4.00');
    const half = convertVndSellToUsd(new Decimal('100125'), new Decimal('25000'));
    expect(half.ok && half.usd.toFixed(2)).toBe('4.01');
    expect(convertVndSellToUsd(new Decimal('100'), new Decimal('25000'))).toEqual({
      ok: false,
      reason: 'INVALID_AMOUNT',
    });
  });
});
