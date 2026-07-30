import { describe, expect, it } from 'vitest';
import { formatDateTime, formatDisplayValue, formatVnd } from './utils';

describe('safe admin formatting', () => {
  it('never renders missing values as undefined or null', () => {
    expect(formatDisplayValue(undefined)).toBe('—');
    expect(formatDisplayValue(null)).toBe('—');
    expect(formatDisplayValue('undefined')).toBe('—');
    expect(formatDisplayValue('null')).toBe('—');
  });

  it('never renders invalid money as NaN', () => {
    expect(formatVnd('undefined')).toBe('—');
    expect(formatVnd('not-a-number')).toBe('—');
  });

  it('never renders invalid dates', () => {
    expect(formatDateTime('undefined')).toBe('—');
    expect(formatDateTime('not-a-date')).toBe('—');
  });
});
