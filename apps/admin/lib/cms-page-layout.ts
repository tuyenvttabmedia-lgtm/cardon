export const CMS_PAGE_LAYOUTS = ['ARTICLE', 'LANDING', 'POLICY'] as const;

export type CmsPageLayoutValue = (typeof CMS_PAGE_LAYOUTS)[number];

export const CMS_PAGE_LAYOUT_LABELS: Record<CmsPageLayoutValue, string> = {
  ARTICLE: 'Bài viết đơn giản',
  LANDING: 'Landing (Giới thiệu)',
  POLICY: 'Chính sách (sidebar)',
};

export const CMS_PAGE_LAYOUT_HINTS: Record<CmsPageLayoutValue, string> = {
  ARTICLE: 'Một khung nội dung — phù hợp trang ngắn.',
  LANDING: 'Hero + block card/thống kê — dùng cho Giới thiệu.',
  POLICY: 'Sidebar menu Trang thông tin + nội dung chính sách.',
};

const POLICY_SLUGS = new Set([
  'chinh-sach-bao-mat',
  'dieu-khoan-su-dung',
  'chinh-sach-hoan-tien',
  'chinh-sach-thanh-toan',
  'chinh-sach-cung-cap-dich-vu',
  'chinh-sach-khieu-nai',
]);

export function defaultPageLayoutForSlug(slug: string): CmsPageLayoutValue {
  if (slug === 'gioi-thieu') return 'LANDING';
  if (POLICY_SLUGS.has(slug)) return 'POLICY';
  return 'ARTICLE';
}

export function isCmsPageLayout(value: string): value is CmsPageLayoutValue {
  return (CMS_PAGE_LAYOUTS as readonly string[]).includes(value);
}

export function hasLandingBlockMarkup(content: string): boolean {
  return /cms-block-/i.test(content);
}

export function resolveEffectivePageLayout(
  slug: string,
  pageLayout: CmsPageLayoutValue | null | undefined,
  options?: { inNav?: boolean; content?: string },
): CmsPageLayoutValue {
  let layout = pageLayout ?? defaultPageLayoutForSlug(slug);

  if (slug === 'gioi-thieu') {
    layout = 'LANDING';
  } else if (options?.content && hasLandingBlockMarkup(options.content)) {
    layout = 'LANDING';
  }

  if (options?.inNav && layout === 'ARTICLE') {
    layout = 'POLICY';
  }

  return layout;
}
