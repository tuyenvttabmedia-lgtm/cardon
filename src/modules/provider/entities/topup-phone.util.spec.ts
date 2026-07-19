import { resolveTopupPhone, normalizeTopupPhone } from './topup-phone.util';

describe('topup-phone.util', () => {
  it('resolves phone from guestPhone', () => {
    expect(
      resolveTopupPhone({ guestPhone: '0912345678', customerNote: null }),
    ).toBe('0912345678');
  });

  it('resolves phone from customerNote fallback', () => {
    expect(
      resolveTopupPhone({ guestPhone: null, customerNote: 'Nạp số: 0987654321' }),
    ).toBe('0987654321');
  });

  it('normalizes +84 prefix', () => {
    expect(normalizeTopupPhone('84912345678')).toBe('0912345678');
  });
});
