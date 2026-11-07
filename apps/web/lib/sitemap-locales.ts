import type { MetadataRoute } from 'next';
import { withLocalePrefix, type Locale } from '@/lib/i18n/locale';
import { blogCategoryPath, blogPostPath } from '@/lib/routes';

/** Routes whose English UI is in the app catalog, not a CMS translation row. */
export const APP_LOCALIZED_PATHS = [
  '/',
  '/the-game',
  '/the-dien-thoai',
  '/nap-cuoc',
  '/nap-data',
  '/esim',
  '/esim/diem-den',
  '/tro-giup',
] as const;

export type EnglishSitemapPage = {
  slug: string;
  type: 'PAGE' | 'PRODUCT_LANDING' | 'BLOG_POST';
  categorySlug: string | null;
  updatedAt: string;
};

export type EnglishSitemapCategory = {
  slug: string;
  updatedAt: string;
};

export function absoluteLocaleUrl(base: string, path: string, locale: Locale): string {
  const root = base.replace(/\/$/, '');
  const bare = path.startsWith('/') ? path : `/${path}`;
  return `${root}${withLocalePrefix(bare.split(/[?#]/)[0] || '/', locale)}`;
}

/** Public path for a published English CMS document. Tags have no storefront route. */
export function publicPathForEnglishPage(page: EnglishSitemapPage): string | null {
  if (page.type === 'BLOG_POST') {
    return blogPostPath(page.categorySlug, page.slug);
  }
  if (page.type === 'PAGE' || page.type === 'PRODUCT_LANDING') {
    return `/${page.slug}`;
  }
  return null;
}

type SitemapEntry = MetadataRoute.Sitemap[number];

function languageAlternates(base: string, path: string): Record<string, string> {
  const vi = absoluteLocaleUrl(base, path, 'vi');
  const en = absoluteLocaleUrl(base, path, 'en');
  return { vi, en, 'x-default': vi };
}

function linkPair(
  map: Map<string, SitemapEntry>,
  base: string,
  path: string,
  seed: Pick<SitemapEntry, 'lastModified' | 'changeFrequency' | 'priority'>,
) {
  const languages = languageAlternates(base, path);
  const viUrl = languages.vi;
  const enUrl = languages.en;
  const existingVi = map.get(viUrl);
  map.set(viUrl, {
    url: viUrl,
    lastModified: existingVi?.lastModified ?? seed.lastModified,
    changeFrequency: existingVi?.changeFrequency ?? seed.changeFrequency,
    priority: existingVi?.priority ?? seed.priority,
    alternates: { languages },
  });
  const existingEn = map.get(enUrl);
  map.set(enUrl, {
    url: enUrl,
    lastModified: existingEn?.lastModified ?? existingVi?.lastModified ?? seed.lastModified,
    changeFrequency: existingEn?.changeFrequency ?? existingVi?.changeFrequency ?? seed.changeFrequency,
    priority: existingEn?.priority ?? existingVi?.priority ?? seed.priority,
    alternates: { languages },
  });
}

/**
 * Keeps every Vietnamese URL already in the sitemap.
 * Adds an English URL only for app-localized routes and CMS documents whose English translation is published.
 */
export function applyPublishedEnglishAlternates(
  entries: MetadataRoute.Sitemap,
  input: {
    base: string;
    appLocalizedPaths: readonly string[];
    englishPages: EnglishSitemapPage[];
    englishCategories: EnglishSitemapCategory[];
    now: Date;
  },
): MetadataRoute.Sitemap {
  const map = new Map<string, SitemapEntry>();
  for (const entry of entries) {
    if (!map.has(entry.url)) map.set(entry.url, entry);
  }

  for (const path of input.appLocalizedPaths) {
    linkPair(map, input.base, path, {
      lastModified: input.now,
      changeFrequency: 'weekly',
      priority: path === '/' ? 1 : 0.7,
    });
  }

  for (const page of input.englishPages) {
    const path = publicPathForEnglishPage(page);
    if (!path || path.includes('?')) continue;
    const updated = new Date(page.updatedAt);
    linkPair(map, input.base, path, {
      lastModified: Number.isNaN(updated.getTime()) ? input.now : updated,
      changeFrequency: page.type === 'BLOG_POST' ? 'weekly' : 'monthly',
      priority: page.type === 'BLOG_POST' ? 0.7 : 0.5,
    });
  }

  for (const category of input.englishCategories) {
    if (!category.slug.trim()) continue;
    const updated = new Date(category.updatedAt);
    linkPair(map, input.base, blogCategoryPath(category.slug), {
      lastModified: Number.isNaN(updated.getTime()) ? input.now : updated,
      changeFrequency: 'daily',
      priority: 0.85,
    });
  }

  return [...map.values()];
}
