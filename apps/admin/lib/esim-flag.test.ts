import { describe, expect, it } from 'vitest';
import { esimProductIso, flagCdnCode } from './esim-flag';

describe('esimProductIso', () => {
  it('resolves published destinations from slug', () => {
    expect(esimProductIso('eSIM Châu Á', 'esim-chau-a')).toBe('ASIA');
    expect(esimProductIso('eSIM Đài Loan', 'esim-dai-loan')).toBe('TW');
    expect(esimProductIso('eSIM Nhật Bản', 'esim-nhat-ban')).toBe('JP');
    expect(esimProductIso('eSIM New Zealand', 'esim-new-zealand')).toBe('NZ');
  });

  it('resolves from Vietnamese name when slug is missing', () => {
    expect(esimProductIso('eSIM Thái Lan')).toBe('TH');
    expect(esimProductIso('eSIM Châu Âu')).toBe('EUROPE');
    expect(flagCdnCode('EUROPE')).toBe('eu');
    expect(flagCdnCode('ASIA')).toBeNull();
    expect(flagCdnCode('JP')).toBe('jp');
  });
});
