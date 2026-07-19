/** Customer-facing URL paths (SEO-friendly). */
export const BLOG_BASE_PATH = '/tin-tuc';

export function blogCategoryPath(categorySlug: string): string {
  return `${BLOG_BASE_PATH}/${categorySlug}`;
}

export function blogPostPath(categorySlug: string | null | undefined, slug: string): string {
  if (categorySlug) return `${BLOG_BASE_PATH}/${categorySlug}/${slug}`;
  return `/${slug}`;
}

export function staticPagePath(slug: string): string {
  return `/${slug}`;
}

export function legacyStaticPagePath(slug: string): string {
  return `/pages/${slug}`;
}
