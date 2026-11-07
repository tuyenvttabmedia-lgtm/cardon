import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { LOCALE_HEADER, withLocalePrefix, type Locale } from '@/lib/i18n/locale';
import type { PublicCmsSeo, PublicCmsSeoSettings } from '@/lib/cms-api';
import { SITE_DESCRIPTION, SITE_NAME, getSiteUrl } from '@/lib/utils';

/** Short brand for `%s | …` template — e.g. "Cardon.vn - Mua thẻ..." → "Cardon.vn". */
function seoTitleTemplateSuffix(siteTitle: string): string {
  const trimmed = siteTitle.trim();
  const dashIdx = trimmed.search(/\s[-—]\s/);
  if (dashIdx > 0) return trimmed.slice(0, dashIdx).trim();
  return trimmed || SITE_NAME;
}

/** True when the page title already includes the brand — avoid `%s | Cardon.vn` doubling. */
export function titleAlreadyBranded(title: string): boolean {
  return /Card[Oo]n\.?\s*vn/i.test(title);
}

/**
 * Absolutize media/OG URLs for public HTML. Rewrites localhost / docker-internal
 * hosts so crawlers never see http://localhost:3001/uploads/...
 */
export function absolutePublicUrl(pathOrUrl: string | null | undefined): string | undefined {
  if (!pathOrUrl?.trim()) return undefined;
  const raw = pathOrUrl.trim();
  const site = getSiteUrl();

  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      const host = u.hostname.toLowerCase();
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '0.0.0.0' ||
        host === 'web' ||
        host === 'api' ||
        host.endsWith('.local')
      ) {
        return `${site}${u.pathname}${u.search}`;
      }
      return `${u.origin}${u.pathname}${u.search}`;
    } catch {
      return raw;
    }
  }

  return `${site}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

export interface PageSeo {
  title: string;
  description?: string;
  path?: string;
  ogImage?: string;
  ogTitle?: string;
  ogDescription?: string;
  type?: 'website' | 'article';
  publishedTime?: string;
  robots?: Metadata['robots'];
  locale?: Locale;
  enTitle?: string;
  enDescription?: string;
  /**
   * False when this document has no published English translation.
   * App-localized routes omit the flag and keep the English alternate.
   */
  includeEnglishAlternate?: boolean;
}

/** Public English body: the API served locale=en with fallback false. A 200 fallback page does not count. */
export function isPublishedEnglishDocument(
  doc: { fallback?: boolean; contentLocale?: string | null } | null | undefined,
): boolean {
  return doc?.fallback === false && doc.contentLocale === 'en';
}

function pathWithoutQuery(path: string): string {
  const cut = path.split(/[?#]/)[0] || '/';
  if (!cut || cut === '/') return '/';
  return cut.startsWith('/') ? cut : `/${cut}`;
}

export async function localizedMetadata(seo: PageSeo): Promise<Metadata> {
  const headerList = await headers();
  const locale: Locale = headerList.get(LOCALE_HEADER) === 'en' ? 'en' : 'vi';
  return buildMetadata({
    ...seo,
    locale,
    title: locale === 'en' && seo.enTitle ? seo.enTitle : seo.title,
    description: locale === 'en' && seo.enDescription ? seo.enDescription : seo.description,
  });
}

function resolveCmsPath(
  pageSlug: string,
  pathPrefix: string,
  canonicalUrl?: string | null,
): string {
  if (canonicalUrl?.trim()) {
    const withoutQuery = canonicalUrl.trim().split(/[?#]/)[0] ?? '';
    const stripped = withoutQuery.replace(getSiteUrl(), '').trim();
    // Only trust same-site relative/absolute canonicals. Query strings are not canonical.
    if (stripped.startsWith('/') && !stripped.startsWith('//')) {
      return pathWithoutQuery(stripped);
    }
    if (withoutQuery.startsWith(getSiteUrl())) {
      return pathWithoutQuery(stripped || `/${pageSlug}`);
    }
    return `/${pageSlug}`;
  }
  if (!pathPrefix) return `/${pageSlug}`;
  const cleaned = pathPrefix.replace(/\/$/, '');
  if (
    cleaned === `/${pageSlug}` ||
    cleaned === pageSlug ||
    cleaned.endsWith(`/${pageSlug}`)
  ) {
    return cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
  }
  return `${cleaned}/${pageSlug}`;
}

export function buildMetadata(seo: PageSeo): Metadata {
  const bare = pathWithoutQuery(seo.path ?? '/');
  const locale = seo.locale ?? 'vi';
  const canonicalPath = withLocalePrefix(bare, locale);
  const url = `${getSiteUrl()}${canonicalPath}`;
  const viUrl = `${getSiteUrl()}${withLocalePrefix(bare, 'vi')}`;
  const enUrl = `${getSiteUrl()}${withLocalePrefix(bare, 'en')}`;
  const description = seo.description ?? SITE_DESCRIPTION;
  const ogTitle = seo.ogTitle?.trim() || seo.title;
  const ogDescription = seo.ogDescription?.trim() || description;
  const absoluteTitle = titleAlreadyBranded(seo.title);
  const ogImage = absolutePublicUrl(seo.ogImage);
  const includeEnglish = seo.includeEnglishAlternate !== false;
  const languages: Record<string, string> = {
    vi: viUrl,
    'x-default': viUrl,
  };
  if (includeEnglish) languages.en = enUrl;
  const contentIsEnglish = locale === 'en' && includeEnglish;

  return {
    title: absoluteTitle ? { absolute: seo.title } : seo.title,
    description,
    alternates: {
      canonical: url,
      languages,
    },
    robots: locale === 'en' && !includeEnglish ? 'noindex,follow' : seo.robots,
    openGraph: {
      type: seo.type ?? 'website',
      locale: contentIsEnglish ? 'en_US' : 'vi_VN',
      url,
      siteName: SITE_NAME,
      title: ogTitle,
      description: ogDescription,
      publishedTime: seo.publishedTime,
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description: ogDescription,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}

export function buildCmsMetadata(
  page: { title: string; excerpt?: string | null; slug: string; publishedAt?: string | null; featuredImage?: string | null },
  seo: PublicCmsSeo | null | undefined,
  pathPrefix: string,
  locale: Locale = 'vi',
  englishPublished = false,
): Metadata {
  const title = seo?.metaTitle ?? page.title;
  const description = seo?.metaDescription ?? page.excerpt ?? page.title;
  const path = resolveCmsPath(page.slug, pathPrefix, seo?.canonicalUrl);
  const ogImage = seo?.ogImage ?? page.featuredImage ?? undefined;
  const isArticle =
    path.includes('/tin-tuc/') ||
    pathPrefix.includes('tin-tuc') ||
    pathPrefix.includes('blog');

  const meta = buildMetadata({
    title,
    description,
    path,
    ogImage,
    ogTitle: seo?.ogTitle ?? undefined,
    ogDescription: seo?.ogDescription ?? undefined,
    type: isArticle ? 'article' : 'website',
    publishedTime: page.publishedAt ?? undefined,
    robots: seo?.robots,
    locale,
    includeEnglishAlternate: englishPublished,
  });

  if (seo?.metaTitle?.trim() || titleAlreadyBranded(title)) {
    return { ...meta, title: { absolute: title } };
  }

  return meta;
}

export function buildGlobalMetadata(
  seo: PublicCmsSeoSettings | null | undefined,
  locale: Locale = 'vi',
): Metadata {
  const brand =
    locale === 'en'
      ? 'CardOn.vn — cards, top-up and travel eSIM'
      : seo?.siteTitle?.trim() || SITE_NAME;
  const templateSuffix = seoTitleTemplateSuffix(brand);
  const description =
    locale === 'en'
      ? 'Buy game cards, phone credit, data and travel eSIM on CardOn.vn.'
      : seo?.metaDescription?.trim() || SITE_DESCRIPTION;
  const ogImage = seo?.ogImageUrl?.trim() || undefined;
  const verificationCode = seo?.searchConsoleVerification?.trim();

  const base = buildMetadata({
    title: brand,
    description,
    path: '/',
    ogImage,
    locale,
  });

  return {
    metadataBase: new URL(`${getSiteUrl()}/`),
    ...base,
    title: {
      default: brand,
      template: `%s | ${templateSuffix}`,
    },
    openGraph: {
      ...base.openGraph,
      siteName: templateSuffix,
    },
    ...(verificationCode
      ? { verification: { google: verificationCode } }
      : {}),
  };
}

export const defaultMetadata: Metadata = buildMetadata({
  title: SITE_NAME,
  path: '/',
});
