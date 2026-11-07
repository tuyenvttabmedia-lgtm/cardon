export const CMS_SEO_SETTING_KEYS = {
  SITE_TITLE: 'cms.seo.site_title',
  META_DESCRIPTION: 'cms.seo.meta_description',
  GOOGLE_ANALYTICS_ID: 'cms.seo.google_analytics_id',
  GOOGLE_TAG_MANAGER_ID: 'cms.seo.google_tag_manager_id',
  SEARCH_CONSOLE_VERIFICATION: 'cms.seo.search_console_verification',
  ROBOTS_TXT: 'cms.seo.robots_txt',
  SITEMAP_ENABLED: 'cms.seo.sitemap_enabled',
  SITEMAP_BASE_URL: 'cms.seo.sitemap_base_url',
  OG_IMAGE_URL: 'cms.seo.og_image_url',
} as const;

export const CMS_THEME_SETTING_KEYS = {
  LOGO_DESKTOP: 'cms.theme.logo_desktop',
  LOGO_MOBILE: 'cms.theme.logo_mobile',
  FAVICON: 'cms.theme.favicon',
  OG_DEFAULT_IMAGE: 'cms.theme.og_default_image',
  HEADER_MENU: 'cms.theme.header_menu',
  FOOTER_COLUMNS: 'cms.theme.footer_columns',
  COMPANY_INFO: 'cms.theme.company_info',
  CONTACT_CHANNELS: 'cms.theme.contact_channels',
  MOBILE_NAV: 'cms.theme.mobile_nav',
  HOME_BACKGROUNDS: 'cms.theme.home_backgrounds',
} as const;

/** Optional CMS overrides for decorative homepage/footer/hub heroes. Empty string = bundled default. */
export interface CmsHomeBackgrounds {
  homeHeroBg?: string;
  homeCategoryGameBg?: string;
  homeCategoryPhoneCardBg?: string;
  homeCategoryTopupBg?: string;
  homeCategoryEsimBg?: string;
  hubHeroGameBg?: string;
  hubHeroPhoneBg?: string;
  hubHeroTopupBg?: string;
  hubHeroEsimBg?: string;
  siteFooterBg?: string;
}

export const CMS_HOME_BACKGROUND_KEYS = [
  'homeHeroBg',
  'homeCategoryGameBg',
  'homeCategoryPhoneCardBg',
  'homeCategoryTopupBg',
  'homeCategoryEsimBg',
  'hubHeroGameBg',
  'hubHeroPhoneBg',
  'hubHeroTopupBg',
  'hubHeroEsimBg',
  'siteFooterBg',
] as const;

export type CmsHomeBackgroundKey = (typeof CMS_HOME_BACKGROUND_KEYS)[number];

/** Accept only same-origin media paths. Empty means “use the safe default”. */
export function sanitizeHomeBackgrounds(
  input: CmsHomeBackgrounds | undefined,
): Record<CmsHomeBackgroundKey, string> {
  const source = input ?? {};
  const next = {} as Record<CmsHomeBackgroundKey, string>;
  for (const key of CMS_HOME_BACKGROUND_KEYS) {
    const raw = (source[key] ?? '').trim();
    if (!raw) {
      next[key] = '';
      continue;
    }
    if (
      raw.length > 512 ||
      raw.includes('..') ||
      raw.includes('\\') ||
      raw.includes('?') ||
      raw.includes('#') ||
      !/^\/(uploads|images)\/[A-Za-z0-9._~/-]+$/.test(raw)
    ) {
      throw new Error(`INVALID_HOME_BACKGROUND:${key}`);
    }
    next[key] = raw;
  }
  return next;
}

export const CMS_BLOG_LIST_DEFAULT_TAKE = 20;
export const CMS_BLOG_LIST_MAX_TAKE = 100;

export const CMS_FAQ_SETTING_KEY = 'cms.faq.items';

export type CmsFaqStatus = 'ACTIVE' | 'INACTIVE';

export interface CmsFaqItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  sortOrder: number;
  /** Defaults to ACTIVE when omitted (legacy items). */
  status?: CmsFaqStatus;
}

export interface CmsCompanyInfo {
  companyName?: string;
  taxCode?: string;
  address?: string;
  hotline?: string;
  email?: string;
}

export const CMS_MEDIA_UPLOAD_ROOT = 'uploads';
/** @deprecated use CMS_MEDIA_UPLOAD_ROOT — kept for backward-compatible tests */
export const CMS_MEDIA_UPLOAD_DIR = 'uploads/general';
export const CMS_MEDIA_MAX_BYTES = 5 * 1024 * 1024;
export const CMS_MEDIA_THUMB_MAX_PX = 300;

export const CMS_PERMISSION = 'cms.manage';

/** Max length for robots.txt CMS setting (Phase 5C.4). */
export const CMS_ROBOTS_TXT_MAX_LENGTH = 10_000;
