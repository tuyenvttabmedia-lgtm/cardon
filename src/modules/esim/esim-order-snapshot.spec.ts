import { Decimal } from '@prisma/client/runtime/library';
import { buildEsimVndPriceSnapshot } from './esim-order-snapshot';

describe('buildEsimVndPriceSnapshot', () => {
  it('locks catalog and charge in VND and ignores a separate USD test amount', () => {
    const lockedAt = new Date('2026-11-06T07:00:00.000Z');
    const snapshot = buildEsimVndPriceSnapshot({
      sellAmount: new Decimal('103000'),
      chargeAmount: new Decimal('103000'),
      market: 'INTL',
      lockedAt,
    });

    expect(snapshot.catalogCurrency).toBe('VND');
    expect(snapshot.catalogAmount.toFixed(2)).toBe('103000.00');
    expect(snapshot.chargeCurrency).toBe('VND');
    expect(snapshot.chargeAmount.toFixed(2)).toBe('103000.00');
    expect(snapshot.chargeAmount.toFixed(2)).not.toBe('1.00');
    expect(snapshot.esimMarket).toBe('INTL');
    expect(snapshot.pricingLockedAt).toBe(lockedAt);
  });
});
