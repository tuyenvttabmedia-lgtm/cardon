import {
  normalizeDashboardPeriod,
  resolveDashboardPeriodRange,
} from './dashboard-period';

describe('dashboard period (Asia/Ho_Chi_Minh)', () => {
  it('defaults invalid / empty period to today', () => {
    expect(normalizeDashboardPeriod(undefined)).toBe('today');
    expect(normalizeDashboardPeriod(null)).toBe('today');
    expect(normalizeDashboardPeriod('')).toBe('today');
    expect(normalizeDashboardPeriod('yesterday')).toBe('today');
    expect(normalizeDashboardPeriod('LAST7')).toBe('last7');
  });

  it('resolves today as [start, endExclusive) on Vietnam calendar', () => {
    // 2026-03-15 10:00 ICT = 2026-03-15 03:00 UTC
    const now = new Date('2026-03-15T03:00:00.000Z');
    const range = resolveDashboardPeriodRange('today', now);
    expect(range.preset).toBe('today');
    expect(range.dateFrom).toBe('2026-03-15');
    expect(range.dateTo).toBe('2026-03-15');
    expect(range.timezone).toBe('Asia/Ho_Chi_Minh');
    expect(range.fromInclusive.toISOString()).toBe('2026-03-14T17:00:00.000Z');
    expect(range.toExclusive.toISOString()).toBe('2026-03-15T17:00:00.000Z');
  });

  it('resolves last7 as today and 6 prior Vietnam days', () => {
    const now = new Date('2026-03-15T03:00:00.000Z');
    const range = resolveDashboardPeriodRange('last7', now);
    expect(range.dateFrom).toBe('2026-03-09');
    expect(range.dateTo).toBe('2026-03-15');
    expect(range.fromInclusive.toISOString()).toBe('2026-03-08T17:00:00.000Z');
    expect(range.toExclusive.toISOString()).toBe('2026-03-15T17:00:00.000Z');
  });

  it('resolves month from day 1 of Vietnam calendar month', () => {
    const now = new Date('2026-03-15T03:00:00.000Z');
    const range = resolveDashboardPeriodRange('month', now);
    expect(range.dateFrom).toBe('2026-03-01');
    expect(range.dateTo).toBe('2026-03-15');
    expect(range.fromInclusive.toISOString()).toBe('2026-02-28T17:00:00.000Z');
    expect(range.toExclusive.toISOString()).toBe('2026-03-15T17:00:00.000Z');
  });

  it('does not shift Vietnam date when UTC is still previous calendar day', () => {
    // 2026-03-14 23:30 ICT = 2026-03-14 16:30 UTC
    const now = new Date('2026-03-14T16:30:00.000Z');
    const range = resolveDashboardPeriodRange('today', now);
    expect(range.dateFrom).toBe('2026-03-14');
    expect(range.fromInclusive.toISOString()).toBe('2026-03-13T17:00:00.000Z');
    expect(range.toExclusive.toISOString()).toBe('2026-03-14T17:00:00.000Z');
  });
});
