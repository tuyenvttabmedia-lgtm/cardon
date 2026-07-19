import { sanitizeCmsHtml } from './cms-html-safety';
import { defaultPageLayoutForSlug, resolveEffectivePageLayout } from './cms-page-layout';

export interface PublicCmsSeoView {
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string | null;
  focusKeyword: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  canonicalUrl: string | null;
  robots: string;
  structuredData: unknown;
}

export interface PublicCmsPageView {
  id: string;
  slug: string;
  title: string;
  content: string;
  excerpt: string | null;
  featuredImage: string | null;
  category: string | null;
  categorySlug: string | null;
  tags: string[];
  pageLayout: 'ARTICLE' | 'LANDING' | 'POLICY';
  publishedAt: string | null;
  seo: PublicCmsSeoView | null;
}

function mapSeo(seo?: {
  metaTitle: string;
  metaDescription: string;
  metaKeywords?: string | null;
  focusKeyword?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImage?: string | null;
  canonicalUrl?: string | null;
  robots?: string;
  structuredData?: unknown;
} | null): PublicCmsSeoView | null {
  if (!seo) return null;
  return {
    metaTitle: seo.metaTitle,
    metaDescription: seo.metaDescription,
    metaKeywords: seo.metaKeywords ?? null,
    focusKeyword: seo.focusKeyword ?? null,
    ogTitle: seo.ogTitle ?? null,
    ogDescription: seo.ogDescription ?? null,
    ogImage: seo.ogImage ?? null,
    canonicalUrl: seo.canonicalUrl ?? null,
    robots: seo.robots ?? 'index,follow',
    structuredData: seo.structuredData ?? null,
  };
}

function extractTags(page: {
  tags?: unknown;
  pageTags?: Array<{ tag: { name: string; slug: string } }>;
}): string[] {
  if (page.pageTags?.length) {
    return page.pageTags.map((pt) => pt.tag.name);
  }
  return Array.isArray(page.tags)
    ? page.tags.filter((t): t is string => typeof t === 'string')
    : [];
}

/** Map stored CMS page to public view with sanitized HTML content. */
export function mapCmsPageForPublic(page: {
  id: string;
  slug: string;
  title: string;
  content: string;
  excerpt: string | null;
  featuredImage: string | null;
  category?: string | null;
  categoryRel?: { name: string; slug: string } | null;
  tags?: unknown;
  pageTags?: Array<{ tag: { name: string; slug: string } }>;
  pageLayout?: 'ARTICLE' | 'LANDING' | 'POLICY' | null;
  showInNav?: boolean;
  publishedAt: Date | null;
  seo?: Parameters<typeof mapSeo>[0];
}): PublicCmsPageView {
  const pageLayout = resolveEffectivePageLayout(page.slug, page.pageLayout, {
    content: page.content,
    inNav: page.showInNav ?? false,
  });

  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    content: sanitizeCmsHtml(page.content),
    excerpt: page.excerpt,
    featuredImage: page.featuredImage,
    category: page.categoryRel?.name ?? page.category ?? null,
    categorySlug: page.categoryRel?.slug ?? null,
    tags: extractTags(page),
    pageLayout,
    publishedAt: page.publishedAt?.toISOString() ?? null,
    seo: mapSeo(page.seo),
  };
}

export function mapCmsBlogPostForPublic(
  page: Parameters<typeof mapCmsPageForPublic>[0],
): PublicCmsPageView {
  const mapped = mapCmsPageForPublic(page);
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: mapped.title,
    description: mapped.excerpt ?? mapped.seo?.metaDescription ?? '',
    image: mapped.featuredImage ?? mapped.seo?.ogImage,
    datePublished: mapped.publishedAt,
    author: { '@type': 'Organization', name: 'CardOn' },
  };
  return {
    ...mapped,
    seo: mapped.seo
      ? { ...mapped.seo, structuredData: mapped.seo.structuredData ?? articleSchema }
      : {
          metaTitle: mapped.title,
          metaDescription: mapped.excerpt ?? mapped.title,
          metaKeywords: null,
          focusKeyword: null,
          ogTitle: mapped.title,
          ogDescription: mapped.excerpt,
          ogImage: mapped.featuredImage,
          canonicalUrl: null,
          robots: 'index,follow',
          structuredData: articleSchema,
        },
  };
}
