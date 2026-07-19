import type { MetadataRoute } from 'next';
import { getGlobalSeoSettings, listBlogCategories, listBlogPosts, listFaqSitemap, listStaticNavPages } from '@/lib/cms-api';
import { BLOG_BASE_PATH, blogCategoryPath, blogPostPath } from '@/lib/routes';
import { STATIC_CMS_PAGES } from '@/lib/static-pages';
import { getSiteUrl } from '@/lib/utils';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const seo = await getGlobalSeoSettings();
  if (seo && seo.sitemapEnabled === false) {
    return [];
  }

  const base = (seo?.sitemapBaseUrl?.trim() || getSiteUrl()).replace(/\/$/, '');
  const now = new Date();

  const navPages = (await listStaticNavPages()) ?? [];
  const cmsNavSlugs = new Set(navPages.map((p) => p.slug));
  const fallbackPages = STATIC_CMS_PAGES.filter((p) => !cmsNavSlugs.has(p.slug));

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${base}${BLOG_BASE_PATH}`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/nap-cuoc`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/nap-data`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/gioi-thieu`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/tro-giup`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    ...navPages.map((p) => ({
      url: `${base}/${p.slug}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    })),
    ...fallbackPages.map((p) => ({
      url: `${base}/${p.slug}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    })),
  ];

  const categories = (await listBlogCategories()) ?? [];
  const categoryPages: MetadataRoute.Sitemap = categories.map((cat) => ({
    url: `${base}${blogCategoryPath(cat.slug)}`,
    lastModified: now,
    changeFrequency: 'daily',
    priority: 0.85,
  }));

  const posts = (await listBlogPosts({ take: 500 })) ?? [];
  const blogPages: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${base}${blogPostPath(post.categorySlug, post.slug)}`,
    lastModified: post.publishedAt ? new Date(post.publishedAt) : now,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  const faqs = (await listFaqSitemap()) ?? [];
  const faqPages: MetadataRoute.Sitemap = faqs.map((faq) => ({
    url: `${base}/tro-giup/${faq.category.slug}/${faq.slug}`,
    lastModified: faq.updatedAt ? new Date(faq.updatedAt) : now,
    changeFrequency: 'monthly',
    priority: 0.5,
  }));

  return [...staticPages, ...categoryPages, ...blogPages, ...faqPages];
}
