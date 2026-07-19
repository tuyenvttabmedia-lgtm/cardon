import type { Metadata } from 'next';
import type { PublicCmsSeo, PublicCmsSeoSettings } from '@/lib/cms-api';
import { SITE_DESCRIPTION, SITE_NAME, getSiteUrl } from '@/lib/utils';

/** Short brand for `%s | …` template — e.g. "Cardon.vn - Mua thẻ..." → "Cardon.vn". */
function seoTitleTemplateSuffix(siteTitle: string): string {
  const trimmed = siteTitle.trim();
  const dashIdx = trimmed.search(/\s[-—]\s/);
  if (dashIdx > 0) return trimmed.slice(0, dashIdx).trim();
  return trimmed || SITE_NAME;
}

export interface PageSeo {
  title: string;
  description?: string;
  path?: string;
  ogImage?: string;
  type?: 'website' | 'article';
  publishedTime?: string;
  robots?: Metadata['robots'];
}

export function buildMetadata(seo: PageSeo): Metadata {
  const url = `${getSiteUrl()}${seo.path ?? ''}`;
  const description = seo.description ?? SITE_DESCRIPTION;

  return {
    title: seo.title,
    description,
    alternates: { canonical: url },
    robots: seo.robots,
    openGraph: {
      type: seo.type ?? 'website',
      locale: 'vi_VN',
      url,
      siteName: SITE_NAME,
      title: seo.title,
      description,
      publishedTime: seo.publishedTime,
      images: seo.ogImage ? [{ url: seo.ogImage }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: seo.title,
      description,
      images: seo.ogImage ? [seo.ogImage] : undefined,
    },
  };
}

export function buildCmsMetadata(
  page: { title: string; excerpt?: string | null; slug: string; publishedAt?: string | null; featuredImage?: string | null },
  seo: PublicCmsSeo | null | undefined,
  pathPrefix: string,
): Metadata {
  const title = seo?.metaTitle ?? page.title;
  const description = seo?.metaDescription ?? page.excerpt ?? page.title;
  const defaultPath = pathPrefix
    ? `${pathPrefix.replace(/\/$/, '')}/${page.slug}`
    : `/${page.slug}`;
  const path = seo?.canonicalUrl?.replace(getSiteUrl(), '') ?? defaultPath;
  const ogImage = seo?.ogImage ?? page.featuredImage ?? undefined;

  const meta = buildMetadata({
    title,
    description,
    path,
    ogImage,
    type: pathPrefix.includes('tin-tuc') || pathPrefix.includes('blog') ? 'article' : 'website',
    publishedTime: page.publishedAt ?? undefined,
    robots: seo?.robots,
  });

  if (seo?.metaTitle?.trim()) {
    return { ...meta, title: { absolute: title } };
  }

  return meta;
}

export function buildGlobalMetadata(seo: PublicCmsSeoSettings | null | undefined): Metadata {
  const brand = seo?.siteTitle?.trim() || SITE_NAME;
  const templateSuffix = seoTitleTemplateSuffix(brand);
  const description = seo?.metaDescription?.trim() || SITE_DESCRIPTION;
  const ogImage = seo?.ogImageUrl?.trim() || undefined;
  const verificationCode = seo?.searchConsoleVerification?.trim();

  const base = buildMetadata({
    title: brand,
    description,
    path: '/',
    ogImage,
  });

  return {
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
