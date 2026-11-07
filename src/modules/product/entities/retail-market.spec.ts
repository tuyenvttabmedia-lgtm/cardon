import { HomeServiceType } from '@prisma/client';
import {
  annotateRetailMarket,
  resolveRetailMarket,
  retailMarketAllowsHomeService,
} from './retail-market';

describe('retail market restriction', () => {
  it('treats a missing country as Vietnam', () => {
    expect(resolveRetailMarket(undefined)).toBe('VN');
    expect(resolveRetailMarket(null)).toBe('VN');
    expect(resolveRetailMarket('')).toBe('VN');
    expect(resolveRetailMarket('xx')).toBe('VN');
    expect(resolveRetailMarket('vn')).toBe('VN');
  });

  it('treats any other country as international', () => {
    expect(resolveRetailMarket('US')).toBe('INTL');
    expect(resolveRetailMarket('sg')).toBe('INTL');
  });

  it('allows card, phone, topup, and data only in Vietnam', () => {
    for (const service of [
      HomeServiceType.GAME_CARD,
      HomeServiceType.PHONE_CARD,
      HomeServiceType.TOPUP,
      HomeServiceType.DATA,
    ]) {
      expect(retailMarketAllowsHomeService('VN', service)).toBe(true);
      expect(retailMarketAllowsHomeService('INTL', service)).toBe(false);
    }
  });

  it('does not apply the Vietnam-only rule to eSIM', () => {
    expect(retailMarketAllowsHomeService('INTL', HomeServiceType.ESIM)).toBe(true);
    expect(retailMarketAllowsHomeService('VN', HomeServiceType.ESIM)).toBe(true);
  });

  it('still blocks a card variant when homeService is omitted', () => {
    expect(retailMarketAllowsHomeService('INTL', null, 'CARD')).toBe(false);
    expect(retailMarketAllowsHomeService('INTL', null, 'TOPUP')).toBe(false);
    expect(retailMarketAllowsHomeService('INTL', null, 'DATA')).toBe(false);
  });

  it('annotates catalog rows without hiding them', () => {
    const row = annotateRetailMarket(
      { homeService: HomeServiceType.GAME_CARD, slug: 'garena' },
      'INTL',
    );
    expect(row.slug).toBe('garena');
    expect(row.marketSupported).toBe(false);
    expect(row.marketNotice).toContain('Việt Nam');
  });
});
