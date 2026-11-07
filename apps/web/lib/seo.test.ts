import { afterEach, describe, expect, it } from 'vitest';
import { buildCmsMetadata, buildMetadata, isPublishedEnglishDocument } from './seo';

describe('locale SEO metadata', () => {
  const previous = process.env.NEXT_PUBLIC_SITE_URL;

  afterEach(() => {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previous;
  });

  function site() {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://cardon.vn';
  }

  it('keeps the Vietnamese canonical and omits English when the translation is not published', () => {
    site();
    const meta = buildMetadata({
      title: 'Phase 3.1 VI da cap nhat',
      description: 'Noi dung VI sau khi sua',
      path: '/phase-3-1-integration-test?utm=1',
      locale: 'vi',
      includeEnglishAlternate: false,
    });
    expect(meta.alternates?.canonical).toBe('https://cardon.vn/phase-3-1-integration-test');
    expect(meta.alternates?.languages).toEqual({
      vi: 'https://cardon.vn/phase-3-1-integration-test',
      'x-default': 'https://cardon.vn/phase-3-1-integration-test',
    });
    expect(meta.openGraph?.locale).toBe('vi_VN');
  });

  it('canonicalizes an English URL to itself and does not advertise a draft as English', () => {
    site();
    const meta = buildMetadata({
      title: 'Phase 3.1 VI da cap nhat',
      description: 'Noi dung VI sau khi sua',
      path: '/phase-3-1-integration-test',
      locale: 'en',
      includeEnglishAlternate: false,
    });
    expect(meta.alternates?.canonical).toBe('https://cardon.vn/en/phase-3-1-integration-test');
    expect(meta.alternates?.languages).not.toHaveProperty('en');
    expect(meta.robots).toBe('noindex,follow');
    expect(meta.openGraph?.url).toBe('https://cardon.vn/en/phase-3-1-integration-test');
    expect(meta.openGraph?.locale).toBe('vi_VN');
  });

  it('links published English both ways and uses the English document URL', () => {
    site();
    const vi = buildMetadata({
      title: 'Phase 3.1 VI da cap nhat',
      path: '/phase-3-1-integration-test',
      locale: 'vi',
      includeEnglishAlternate: true,
    });
    const en = buildCmsMetadata(
      {
        title: 'Phase 3 Integration Test',
        excerpt: 'English draft integration test',
        slug: 'phase-3-1-integration-test',
      },
      {
        metaTitle: 'Phase 3 Integration Test',
        metaDescription: 'English draft integration test',
        ogTitle: 'Phase 3 OG',
        ogDescription: 'English OG description',
        canonicalUrl: 'https://cardon.vn/phase-3-1-integration-test?ref=vi',
      },
      '',
      'en',
      true,
    );
    expect(vi.alternates?.languages).toEqual(en.alternates?.languages);
    expect(en.alternates?.canonical).toBe('https://cardon.vn/en/phase-3-1-integration-test');
    expect(en.alternates?.languages).toEqual({
      vi: 'https://cardon.vn/phase-3-1-integration-test',
      en: 'https://cardon.vn/en/phase-3-1-integration-test',
      'x-default': 'https://cardon.vn/phase-3-1-integration-test',
    });
    expect(en.title).toEqual({ absolute: 'Phase 3 Integration Test' });
    expect(en.description).toBe('English draft integration test');
    expect(en.openGraph?.locale).toBe('en_US');
    expect(en.openGraph?.title).toBe('Phase 3 OG');
    expect(isPublishedEnglishDocument({ fallback: false, contentLocale: 'en' })).toBe(true);
    expect(isPublishedEnglishDocument({ fallback: true, contentLocale: 'vi' })).toBe(false);
  });

  it('keeps English alternates for app-localized routes', () => {
    site();
    const meta = buildMetadata({
      title: 'Game cards',
      path: '/the-game',
      locale: 'en',
    });
    expect(meta.alternates?.canonical).toBe('https://cardon.vn/en/the-game');
    expect(meta.alternates?.languages).toMatchObject({
      en: 'https://cardon.vn/en/the-game',
      vi: 'https://cardon.vn/the-game',
    });
    expect(meta.robots).toBeUndefined();
  });
});
