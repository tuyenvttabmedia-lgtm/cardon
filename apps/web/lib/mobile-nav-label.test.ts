import { describe, expect, it } from 'vitest';
import { compactMobileNavLabel } from './mobile-nav-label';

describe('compactMobileNavLabel', () => {
  it('shortens phone card labels for the bottom bar', () => {
    expect(compactMobileNavLabel('Thẻ điện thoại')).toBe('Thẻ ĐT');
    expect(compactMobileNavLabel('Mua thẻ điện thoại')).toBe('Thẻ ĐT');
    expect(compactMobileNavLabel('Phone cards')).toBe('Phone');
  });

  it('shortens long eSIM / data labels', () => {
    expect(compactMobileNavLabel('eSIM du lịch')).toBe('eSIM');
    expect(compactMobileNavLabel('Nạp Data')).toBe('Data');
  });

  it('keeps already-short labels', () => {
    expect(compactMobileNavLabel('Trang chủ')).toBe('Trang chủ');
    expect(compactMobileNavLabel('Nạp cước')).toBe('Nạp cước');
    expect(compactMobileNavLabel('Thẻ game')).toBe('Thẻ game');
  });
});
