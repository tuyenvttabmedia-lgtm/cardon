/** Brand context assembled from existing CMS theme + SEO + system settings (read-only). */
export interface BrandContext {
  siteName: string;
  publicUrl: string;
  siteTitle: string | null;
  metaDescription: string | null;
  companyName: string | null;
  hotline: string | null;
  email: string | null;
  address: string | null;
  source: 'CMS_THEME' | 'CMS_SEO' | 'SYSTEM_SETTINGS';
}
