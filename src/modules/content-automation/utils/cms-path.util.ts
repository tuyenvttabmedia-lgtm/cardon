/** Aligned with apps/web/lib/routes.ts — backend path resolution for internal links. */
export const BLOG_BASE_PATH = '/tin-tuc';

export function blogPostPath(
  categorySlug: string | null | undefined,
  slug: string,
): string {
  if (categorySlug) return `${BLOG_BASE_PATH}/${categorySlug}/${slug}`;
  return `/${slug}`;
}

export function staticPagePath(slug: string): string {
  return `/${slug}`;
}

export function resolveCmsPublicPath(
  type: string,
  slug: string,
  categorySlug: string | null | undefined,
): string {
  if (type === 'BLOG_POST') return blogPostPath(categorySlug, slug);
  return staticPagePath(slug);
}
