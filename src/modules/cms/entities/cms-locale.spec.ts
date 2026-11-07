import {
  hasEnglishCategoryName,
  hasPublishedEnglishTranslation,
  resolvePublicCategoryLocale,
  resolvePublicPageLocale,
} from './cms-locale';

const page = {
  slug: 'the-game',
  title: 'Thẻ game',
  excerpt: 'Mua thẻ game',
  content: '<p>Nội dung Việt</p>',
  category: 'Game',
  seo: {
    metaTitle: 'SEO Việt',
    metaDescription: 'Mô tả Việt',
    metaKeywords: 'the, game',
    ogTitle: 'OG Việt',
    ogDescription: 'OG mô tả',
    ogImage: '/images/og.jpg',
    canonicalUrl: 'https://cardon.vn/the-game',
    robots: 'index,follow',
    structuredData: { '@type': 'WebPage' },
  },
  translations: [
    {
      locale: 'vi' as const,
      title: 'Thẻ game đã backfill',
      excerpt: 'Mô tả đã backfill',
      content: '<p>Nội dung đã backfill</p>',
      status: 'PUBLISHED' as const,
    },
  ],
  seoTranslations: [
    {
      locale: 'vi' as const,
      metaTitle: 'SEO backfill',
      metaDescription: 'Mô tả backfill',
      metaKeywords: 'backfill',
      ogTitle: null,
      ogDescription: null,
      canonicalUrl: null,
    },
  ],
  categoryRel: {
    name: 'Game',
    slug: 'game',
    translations: [{ locale: 'vi' as const, name: 'Trò chơi' }],
  },
  pageTags: [{ tag: { name: 'Steam', slug: 'steam', translations: [{ locale: 'vi' as const, name: 'Steam Việt' }] } }],
};

describe('public CMS locale resolution', () => {
  it('keeps the legacy shape when locale is omitted', () => {
    const resolved = resolvePublicPageLocale(page, undefined);
    expect(resolved.meta).toBeNull();
    expect(resolved.page.title).toBe('Thẻ game');
    expect(resolved.page.content).toBe('<p>Nội dung Việt</p>');
  });

  it('reads the published Vietnamese translation', () => {
    const resolved = resolvePublicPageLocale(page, 'vi');
    expect(resolved.page.title).toBe('Thẻ game đã backfill');
    expect(resolved.page.content).toBe('<p>Nội dung đã backfill</p>');
    expect(resolved.page.categoryRel?.name).toBe('Trò chơi');
    expect(resolved.page.pageTags?.[0].tag.name).toBe('Steam Việt');
    expect(resolved.page.seo?.metaTitle).toBe('SEO backfill');
    expect(resolved.page.seo?.ogTitle).toBe('OG Việt');
    expect(resolved.page.seo?.ogImage).toBe('/images/og.jpg');
    expect(resolved.page.seo?.robots).toBe('index,follow');
    expect(resolved.meta).toEqual({ requestedLocale: 'vi', contentLocale: 'vi', fallback: false });
  });

  it('falls back to original columns when the Vietnamese translation is missing', () => {
    const resolved = resolvePublicPageLocale({ ...page, translations: [], seoTranslations: [] }, 'vi');
    expect(resolved.page.title).toBe('Thẻ game');
    expect(resolved.page.content).toBe('<p>Nội dung Việt</p>');
    expect(resolved.page.seo?.metaTitle).toBe('SEO Việt');
    expect(resolved.meta).toEqual({ requestedLocale: 'vi', contentLocale: 'vi', fallback: true });
  });

  it('returns a published English translation without mixing Vietnamese SEO text', () => {
    const resolved = resolvePublicPageLocale(
      {
        ...page,
        translations: [
          ...page.translations,
          {
            locale: 'en',
            title: 'Game cards',
            excerpt: 'Buy game cards',
            content: '<p>English body</p>',
            status: 'PUBLISHED',
          },
        ],
        seoTranslations: [
          ...page.seoTranslations,
          { locale: 'en', metaTitle: '', metaDescription: null, canonicalUrl: null },
        ],
      },
      'en',
    );
    expect(resolved.page.title).toBe('Game cards');
    expect(resolved.page.content).toBe('<p>English body</p>');
    expect(resolved.page.seo?.metaTitle).toBe('Game cards');
    expect(resolved.page.seo?.metaDescription).toBe('Buy game cards');
    expect(resolved.page.seo?.metaKeywords).toBeNull();
    expect(resolved.page.seo?.canonicalUrl).toBe('https://cardon.vn/the-game');
    expect(resolved.page.seo?.ogImage).toBe('/images/og.jpg');
    expect(resolved.page.seo?.structuredData).toEqual({ '@type': 'WebPage' });
    expect(resolved.page.slug).toBe('the-game');
    expect(resolved.meta).toEqual({ requestedLocale: 'en', contentLocale: 'en', fallback: false });
  });

  it('does not publish an English draft', () => {
    const resolved = resolvePublicPageLocale(
      {
        ...page,
        translations: [
          ...page.translations,
          {
            locale: 'en',
            title: 'Draft English',
            excerpt: 'Hidden',
            content: '<p>Draft</p>',
            status: 'DRAFT',
          },
        ],
      },
      'en',
    );
    expect(resolved.page.title).toBe('Thẻ game đã backfill');
    expect(resolved.page.content).not.toContain('Draft');
    expect(resolved.meta).toEqual({ requestedLocale: 'en', contentLocale: 'vi', fallback: true });
  });

  it('returns Vietnamese with fallback when English is absent', () => {
    const resolved = resolvePublicPageLocale(page, 'en');
    expect(resolved.page.content).toBe('<p>Nội dung đã backfill</p>');
    expect(resolved.page.seo?.metaTitle).toBe('SEO backfill');
    expect(resolved.meta).toEqual({ requestedLocale: 'en', contentLocale: 'vi', fallback: true });
  });

  it('keeps category slug and falls back the whole category when English is absent', () => {
    const category = {
      slug: 'game',
      name: 'Game',
      description: 'Mô tả',
      intro: 'Giới thiệu',
      metaTitle: 'Meta',
      metaDescription: null,
      canonicalUrl: '/tin-tuc/game',
      ogImageUrl: '/images/game.jpg',
      translations: [{ locale: 'vi' as const, name: 'Trò chơi', description: 'Mô tả dịch' }],
    };
    const english = resolvePublicCategoryLocale(category, 'en');
    expect(english.category.name).toBe('Game');
    expect(english.category.slug).toBe('game');
    expect(english.category.ogImageUrl).toBe('/images/game.jpg');
    expect(english.meta?.fallback).toBe(true);

    const vietnamese = resolvePublicCategoryLocale(category, 'vi');
    expect(vietnamese.category.name).toBe('Trò chơi');
    expect(vietnamese.category.description).toBe('Mô tả dịch');
    expect(vietnamese.meta?.fallback).toBe(false);

    const translated = resolvePublicCategoryLocale(
      {
        ...category,
        translations: [
          ...category.translations,
          { locale: 'en' as const, name: 'Games', description: null, intro: 'Intro' },
        ],
      },
      'en',
    );
    expect(translated.category.name).toBe('Games');
    expect(translated.category.description).toBeNull();
    expect(translated.category.intro).toBe('Intro');
    expect(translated.category.ogImageUrl).toBe('/images/game.jpg');
    expect(translated.category.canonicalUrl).toBe('/tin-tuc/game');
    expect(translated.meta).toEqual({ requestedLocale: 'en', contentLocale: 'en', fallback: false });
  });

  it('indexes English only when the page translation is published', () => {
    expect(hasPublishedEnglishTranslation([{ locale: 'en', status: 'DRAFT' }])).toBe(false);
    expect(hasPublishedEnglishTranslation([{ locale: 'vi', status: 'PUBLISHED' }])).toBe(false);
    expect(hasPublishedEnglishTranslation([{ locale: 'en', status: 'PUBLISHED' }])).toBe(true);
    expect(hasEnglishCategoryName([{ locale: 'en', name: '   ' }])).toBe(false);
    expect(hasEnglishCategoryName([{ locale: 'vi', name: 'Thẻ game' }])).toBe(false);
    expect(hasEnglishCategoryName([{ locale: 'en', name: 'Game cards' }])).toBe(true);
  });
});
