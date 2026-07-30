import { detectTelcoFromPhone, matchCarrier } from '@/lib/topup-flow';

describe('matchCarrier', () => {
  it('does not treat vietnamobile as viettel or vinaphone', () => {
    const product = { slug: 'vietnamobile-topup', name: 'Nạp Vietnamobile' };
    expect(matchCarrier(product, 'vietnamobile')).toBe(true);
    expect(matchCarrier(product, 'viettel')).toBe(false);
    expect(matchCarrier(product, 'vinaphone')).toBe(false);
    expect(matchCarrier(product, 'mobifone')).toBe(false);
  });

  it('matches peer topup products', () => {
    expect(matchCarrier({ slug: 'viettel-topup', name: 'Nạp Viettel' }, 'viettel')).toBe(true);
    expect(matchCarrier({ slug: 'vinaphone-topup', name: 'Nạp Vinaphone' }, 'vinaphone')).toBe(true);
    expect(matchCarrier({ slug: 'mobifone-topup', name: 'Nạp Mobifone' }, 'mobifone')).toBe(true);
  });
});

describe('detectTelcoFromPhone', () => {
  it('detects vietnamobile prefixes', () => {
    expect(detectTelcoFromPhone('0921234567')).toBe('vietnamobile');
    expect(detectTelcoFromPhone('0561234567')).toBe('vietnamobile');
  });
});
