import { sanitizeHomeBackgrounds } from './cms.constants';

describe('sanitizeHomeBackgrounds', () => {
  it('keeps uploaded paths and clears empty values', () => {
    expect(
      sanitizeHomeBackgrounds({
        homeHeroBg: '  /uploads/banners/hero.jpg  ',
        homeCategoryGameBg: '',
        siteFooterBg: '/images/home/backgrounds/footer.jpg',
      }),
    ).toEqual({
      homeHeroBg: '/uploads/banners/hero.jpg',
      homeCategoryGameBg: '',
      homeCategoryPhoneCardBg: '',
      homeCategoryTopupBg: '',
      homeCategoryEsimBg: '',
      hubHeroGameBg: '',
      hubHeroPhoneBg: '',
      hubHeroTopupBg: '',
      hubHeroEsimBg: '',
      siteFooterBg: '/images/home/backgrounds/footer.jpg',
    });
  });

  it('rejects external and path-traversal URLs', () => {
    expect(() =>
      sanitizeHomeBackgrounds({ homeHeroBg: 'https://evil.example/hero.jpg' }),
    ).toThrow('INVALID_HOME_BACKGROUND:homeHeroBg');
    expect(() =>
      sanitizeHomeBackgrounds({ siteFooterBg: '/uploads/../secret.jpg' }),
    ).toThrow('INVALID_HOME_BACKGROUND:siteFooterBg');
  });
});
