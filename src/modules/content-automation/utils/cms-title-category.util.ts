import { ContentPlanContentType } from '@prisma/client';

/** Map plan contentType → preferred CMS blog category slug (CardOn.vn). */
export const CONTENT_TYPE_CMS_CATEGORY_SLUG: Partial<
  Record<ContentPlanContentType, string>
> = {
  GUIDE: 'huong-dan',
  TUTORIAL: 'huong-dan',
  TROUBLESHOOTING: 'huong-dan',
  EXPLAINER: 'huong-dan',
  FAQ: 'huong-dan',
  PROMOTION: 'khuyen-mai',
  PRODUCT: 'the-game',
  NEWS: 'huong-dan',
  COMPARISON: 'huong-dan',
};

const TITLE_PREFIX_RE =
  /^(hướng dẫn|huong dan|faq|tutorial|tin tức|tin tuc|khuyến mãi|khuyen mai)\s*[:\-–|]\s*/i;

/**
 * Topic = planning subject. Article H1 / CMS title should be SEO title without
 * category-style prefixes (category belongs on cms_pages.category_id).
 */
export function cleanSeoArticleTitle(title: string, fallbackTopic?: string): string {
  const cleaned = title.trim().replace(TITLE_PREFIX_RE, '').trim();
  if (cleaned) return cleaned.slice(0, 255);
  return (fallbackTopic ?? '').trim().slice(0, 255);
}

export function preferredCmsCategorySlug(
  contentType: ContentPlanContentType,
): string | null {
  return CONTENT_TYPE_CMS_CATEGORY_SLUG[contentType] ?? null;
}
