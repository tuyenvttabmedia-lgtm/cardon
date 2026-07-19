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
} as const;

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
