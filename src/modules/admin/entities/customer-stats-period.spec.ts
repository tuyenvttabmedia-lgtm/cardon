import {
  enumerateVietnamDates,
  normalizeCustomerStatsPeriod,
  resolveCustomerStatsPeriodRange,
} from './customer-stats-period';

describe('customer-stats-period', () => {
  it('defaults to 30d', () => {
    expect(normalizeCustomerStatsPeriod(undefined)).toBe('30d');
    expect(normalizeCustomerStatsPeriod('nope')).toBe('30d');
  });

  it('resolves today as a single ICT day', () => {
    const now = new Date('2026-11-15T10:00:00+07:00');
    const range = resolveCustomerStatsPeriodRange('today', now);
    expect(range.preset).toBe('today');
    expect(range.dateFrom).toBe('2026-11-15');
    expect(range.dateTo).toBe('2026-11-15');
    expect(range.dayCount).toBe(1);
    expect(range.fromInclusive.toISOString()).toBe('2026-11-14T17:00:00.000Z');
    expect(range.toExclusive.toISOString()).toBe('2026-11-15T17:00:00.000Z');
  });

  it('resolves 7d inclusive window ending today ICT', () => {
    const now = new Date('2026-11-15T10:00:00+07:00');
    const range = resolveCustomerStatsPeriodRange('7d', now);
    expect(range.preset).toBe('7d');
    expect(range.dateTo).toBe('2026-11-15');
    expect(range.dateFrom).toBe('2026-11-09');
    expect(range.dayCount).toBe(7);
  });

  it('enumerates contiguous dates', () => {
    expect(enumerateVietnamDates('2026-11-13', '2026-11-15')).toEqual([
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
    ]);
  });
});
