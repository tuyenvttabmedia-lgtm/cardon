import { describe, expect, it } from 'vitest';
import { applyPublishedEnglishAlternates, publicPathForEnglishPage } from './sitemap-locales';

describe('sitemap locale entries', () => {
  const now = new Date('2026-11-06T00:00:00.000Z');
  const base = 'https://cardon.vn';

  it('does not add an English URL for a draft and keeps the Vietnamese URL', () => {
    const result = applyPublishedEnglishAlternates(
      [{ url: `${base}/gioi-thieu`, lastModified: now, priority: 0.6 }],
      { base, appLocalizedPaths: [], englishPages: [], englishCategories: [], now },
    );
    expect(result.map((entry) => entry.url)).toEqual([`${base}/gioi-thieu`]);
    expect(result[0]?.alternates).toBeUndefined();
  });

  it('adds both URLs and reciprocal alternates only for a published English page', () => {
    const result = applyPublishedEnglishAlternates(
      [{ url: `${base}/the-game`, priority: 0.9 }],
      {
        base,
        appLocalizedPaths: ['/the-game'],
        englishPages: [
          {
            slug: 'phase-3-1-integration-test',
            type: 'PAGE',
            categorySlug: null,
            updatedAt: '2026-11-06T01:00:00.000Z',
          },
        ],
        englishCategories: [],
        now,
      },
    );
    const urls = result.map((entry) => entry.url);
    expect(urls).toContain(`${base}/the-game`);
    expect(urls).toContain(`${base}/en/the-game`);
    expect(urls).toContain(`${base}/phase-3-1-integration-test`);
    expect(urls).toContain(`${base}/en/phase-3-1-integration-test`);
    expect(urls).not.toContain(`${base}/en/gioi-thieu`);
    const page = result.find((entry) => entry.url === `${base}/phase-3-1-integration-test`);
    const english = result.find((entry) => entry.url === `${base}/en/phase-3-1-integration-test`);
    expect(page?.alternates?.languages).toEqual(english?.alternates?.languages);
    expect(page?.alternates?.languages?.en).toBe(`${base}/en/phase-3-1-integration-test`);
    expect(page?.alternates?.languages?.['x-default']).toBe(`${base}/phase-3-1-integration-test`);
    expect(publicPathForEnglishPage({
      slug: 'bai',
      type: 'BLOG_POST',
      categorySlug: 'huong-dan',
      updatedAt: now.toISOString(),
    })).toBe('/tin-tuc/huong-dan/bai');
  });

  it('adds an English category URL only when that category is published in English', () => {
    const result = applyPublishedEnglishAlternates(
      [{ url: `${base}/tin-tuc/the-game` }, { url: `${base}/tin-tuc/khuyen-mai` }],
      {
        base,
        appLocalizedPaths: [],
        englishPages: [],
        englishCategories: [{ slug: 'the-game', updatedAt: now.toISOString() }],
        now,
      },
    );
    const urls = result.map((entry) => entry.url);
    expect(urls).toContain(`${base}/en/tin-tuc/the-game`);
    expect(urls).not.toContain(`${base}/en/tin-tuc/khuyen-mai`);
  });
});
