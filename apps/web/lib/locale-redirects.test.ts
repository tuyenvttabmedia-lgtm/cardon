import { describe, expect, it } from 'vitest';
import { englishLegacyRedirect } from './locale-redirects';

describe('english legacy redirects', () => {
  it('keeps the /en prefix on content, catalog and CMS aliases', () => {
    expect(englishLegacyRedirect('/huong-dan', new URLSearchParams())).toBe('/en/tin-tuc/huong-dan');
    expect(englishLegacyRedirect('/khuyen-mai', new URLSearchParams('q=1'))).toBe('/en/tin-tuc/khuyen-mai?q=1');
    expect(englishLegacyRedirect('/cards', new URLSearchParams('service=PHONE_CARD'))).toBe('/en/the-dien-thoai');
    expect(englishLegacyRedirect('/pages/gioi-thieu', new URLSearchParams())).toBe('/en/gioi-thieu');
    expect(englishLegacyRedirect('/the-game', new URLSearchParams())).toBeNull();
  });
});