import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  financeDefaultPresetForPath,
  financePresetRange,
  isFinanceYesterdayDefaultPath,
} from './finance-date-presets';

describe('financePresetRange', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves yesterday and lastMonth on Vietnam calendar', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T10:00:00+07:00'));

    expect(financePresetRange('yesterday')).toEqual({
      from: '2026-03-14',
      to: '2026-03-14',
    });
    expect(financePresetRange('lastMonth')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
    expect(financePresetRange('month')).toEqual({
      from: '2026-03-01',
      to: '2026-03-15',
    });
  });
});

describe('finance tab date defaults', () => {
  it('defaults eSale + retail tabs to yesterday', () => {
    expect(isFinanceYesterdayDefaultPath('/finance/supplier')).toBe(true);
    expect(isFinanceYesterdayDefaultPath('/finance/retail')).toBe(true);
    expect(financeDefaultPresetForPath('/finance/supplier')).toBe('yesterday');
    expect(financeDefaultPresetForPath('/finance/retail')).toBe('yesterday');
  });

  it('keeps month default for other finance tabs', () => {
    expect(isFinanceYesterdayDefaultPath('/finance/esim')).toBe(false);
    expect(isFinanceYesterdayDefaultPath('/finance/gateway-fee')).toBe(false);
    expect(isFinanceYesterdayDefaultPath('/finance/summary')).toBe(false);
    expect(financeDefaultPresetForPath('/finance/esim')).toBe('month');
  });
});
