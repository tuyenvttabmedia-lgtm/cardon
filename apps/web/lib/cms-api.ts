import { getApiBaseUrl } from '@/lib/utils';

export interface PublicCmsSeo {
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
}

export interface PublicCmsPage {
  id: string;
  slug: string;
  title: string;
  content: string;
  excerpt: string | null;
  featuredImage: string | null;
  category: string | null;
  categorySlug: string | null;
  tags: string[];
  pageLayout?: 'ARTICLE' | 'LANDING' | 'POLICY';
  publishedAt: string | null;
  seo: PublicCmsSeo | null;
}

export interface PublicCmsNavItem {
  slug: string;
  title: string;
  navSortOrder: number;
}

export interface PublicBlogPost {
  id: string;
  slug: string;
  title: string;
  content: string;
  excerpt: string | null;
  featuredImage: string | null;
  category: string | null;
  categorySlug: string | null;
  tags: string[];
  publishedAt: string | null;
  seo: PublicCmsSeo | null;
}

interface ApiSuccess<T> {
  success: true;
  data: T;
}

async function cmsFetch<T>(path: string, revalidateSeconds = 60): Promise<T | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}${path}`, {
      next: { revalidate: revalidateSeconds },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) return null;
    const payload = (await res.json()) as ApiSuccess<T>;
    return payload.data;
  } catch {
    return null;
  }
}

export function listBlogPosts(params?: { category?: string; tag?: string; skip?: number; take?: number }) {
  const q = new URLSearchParams();
  if (params?.category) q.set('category', params.category);
  if (params?.tag) q.set('tag', params.tag);
  if (params?.skip != null) q.set('skip', String(params.skip));
  if (params?.take != null) q.set('take', String(params.take));
  const qs = q.toString();
  return cmsFetch<PublicBlogPost[]>(`/cms/blog/posts${qs ? `?${qs}` : ''}`, 0);
}

export function getCmsPage(slug: string) {
  return cmsFetch<PublicCmsPage>(`/cms/pages/${slug}`);
}

export function listStaticNavPages() {
  return cmsFetch<PublicCmsNavItem[]>('/cms/pages/nav', 60);
}

export function getBlogPost(slug: string) {
  return cmsFetch<{ post: PublicBlogPost; related: PublicBlogPost[] }>(`/cms/blog/posts/${slug}`);
}

export interface PublicBlogCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  intro: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  ogImageUrl: string | null;
  sortOrder: number;
}

export function listBlogCategories() {
  return cmsFetch<PublicBlogCategory[]>('/cms/blog/categories', 60);
}

export function getBlogCategory(slug: string) {
  return cmsFetch<PublicBlogCategory>(`/cms/blog/categories/${slug}`, 60);
}

export interface PublicFaqCategory {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
  sortOrder: number;
}

export interface PublicFaqItem {
  id: string;
  question: string;
  answer: string;
  slug: string;
  featured: boolean;
  sortOrder: number;
  viewCount?: number;
  category: PublicFaqCategory;
  positions: string[];
  updatedAt?: string;
}

export interface PublicFaqListResult {
  items: PublicFaqItem[];
  total: number;
  offset: number;
  limit: number;
}

export interface PublicFaqDetail {
  faq: PublicFaqItem;
  related: PublicFaqItem[];
}

export function listFaqCategories() {
  return cmsFetch<PublicFaqCategory[]>('/cms/faq/categories', 60);
}

export async function listFaqCategoriesClient(): Promise<PublicFaqCategory[] | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/cms/faq/categories`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const payload = (await res.json()) as ApiSuccess<PublicFaqCategory[]>;
    return payload.data ?? [];
  } catch {
    return null;
  }
}

export type FetchFaqsParams = {
  q?: string;
  category?: string;
  position?: string;
  featured?: boolean;
  limit?: number;
  offset?: number;
};

function buildFaqQuery(params: FetchFaqsParams): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  if (params.category) sp.set('category', params.category);
  if (params.position) sp.set('position', params.position);
  if (params.featured) sp.set('featured', 'true');
  if (params.limit != null) sp.set('limit', String(params.limit));
  if (params.offset != null && params.offset > 0) sp.set('offset', String(params.offset));
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

/** Server-side FAQ list */
export function listFaqs(params: FetchFaqsParams = {}) {
  return cmsFetch<PublicFaqListResult>(`/cms/faqs${buildFaqQuery(params)}`, 60);
}

/** Client-side FAQ fetch */
export async function fetchFaqsClient(
  params: FetchFaqsParams = {},
): Promise<PublicFaqListResult | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/cms/faqs${buildFaqQuery(params)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as ApiSuccess<PublicFaqListResult>;
    return payload.data ?? { items: [], total: 0, offset: 0, limit: params.limit ?? 20 };
  } catch {
    return null;
  }
}

export function getFaqDetail(categorySlug: string, slug: string) {
  return cmsFetch<PublicFaqDetail>(`/cms/faqs/${categorySlug}/${slug}`, 60);
}

export async function fetchFaqDetailClient(
  categorySlug: string,
  slug: string,
): Promise<PublicFaqDetail | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/cms/faqs/${categorySlug}/${slug}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as ApiSuccess<PublicFaqDetail>;
    return payload.data ?? null;
  } catch {
    return null;
  }
}

export function listFaqSitemap() {
  return cmsFetch<Array<{ slug: string; updatedAt: string; category: { slug: string } }>>(
    '/cms/faqs/sitemap',
    300,
  );
}

/** @deprecated use fetchFaqsClient */
export function listFaq(category?: string) {
  const q = category ? `?category=${encodeURIComponent(category)}` : '';
  return cmsFetch<PublicFaqItem[]>(`/cms/faqs${q}`);
}

/** @deprecated use fetchFaqsClient */
export async function fetchFaqClient(category?: string): Promise<PublicFaqItem[] | null> {
  const legacyMap: Record<string, FetchFaqsParams> = {
    homepage: { featured: true, limit: 10 },
    contact: { position: 'contact', limit: 10 },
  };
  const params = category ? legacyMap[category] ?? { category, limit: 20 } : { limit: 20 };
  const result = await fetchFaqsClient(params);
  return result?.items ?? null;
}

export interface CmsThemeSettings {
  logoDesktop: string;
  logoMobile: string;
  favicon: string;
  ogDefaultImage: string;
  headerMenu: Array<{ label: string; href: string; sortOrder?: number }>;
  footerColumns: Array<{ title: string; links: Array<{ label: string; href: string }> }>;
  companyInfo?: {
    companyName?: string;
    taxCode?: string;
    address?: string;
    hotline?: string;
    email?: string;
  };
  contactChannels?: Array<{
    key: 'email' | 'hotline' | 'zalo' | 'fanpage' | 'address';
    enabled?: boolean;
    value?: string;
    href?: string;
  }>;
  mobileNav?: Array<{
    label: string;
    icon: string;
    url: string;
    sortOrder?: number;
    requireLogin?: boolean;
    active?: boolean;
  }>;
}

export interface PublicSiteConfig {
  company: CmsThemeSettings['companyInfo'];
  siteName?: string;
  publicUrl?: string;
  platformMaintenance?: PlatformMaintenanceStatus;
  orderLimits?: {
    guestMaxOrderAmount: number;
    customerMaxOrderAmount: number;
  };
  topup: {
    adminEnabled: boolean;
    providerConfigured: boolean;
    fulfillmentReady: boolean;
    ready: boolean;
    reason: string | null;
  };
  data: {
    adminEnabled: boolean;
    providerConfigured: boolean;
    fulfillmentReady: boolean;
    ready: boolean;
    reason: string | null;
  };
}

export interface PlatformMaintenanceStatus {
  mode: string;
  active: boolean;
  readOnly: boolean;
  maintenance: boolean;
  emergency: boolean;
  reason?: string | null;
  banner?: Record<string, unknown>;
  customerPage?: {
    supportLink?: string;
    telegram?: string;
    facebook?: string;
    hotline?: string;
    estimatedFinish?: string | null;
  };
  schedule?: Record<string, unknown>;
  estimatedFinish?: string | null;
}

export interface CmsBanner {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl?: string | null;
  position: string;
  sortOrder: number;
}

export function getThemeSettings() {
  return fetchThemeSettingsClient();
}

/** Client-side theme fetch — bypass CDN/browser cache after admin saves. */
export async function fetchThemeSettingsClient(): Promise<CmsThemeSettings | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/cms/theme`, { cache: 'no-store' });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) return null;
    const payload = (await res.json()) as ApiSuccess<CmsThemeSettings>;
    return payload.data;
  } catch {
    return null;
  }
}

export function getSiteConfig() {
  return cmsFetch<PublicSiteConfig>('/cms/site-config');
}

export function getPlatformStatus() {
  return cmsFetch<PlatformMaintenanceStatus>('/cms/platform-status', 0);
}

/** Client-side platform status — always fresh for maintenance page. */
export async function fetchPlatformStatusClient(): Promise<PlatformMaintenanceStatus | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/cms/platform-status`, { cache: 'no-store' });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) return null;
    const payload = (await res.json()) as ApiSuccess<PlatformMaintenanceStatus>;
    return payload.data;
  } catch {
    return null;
  }
}

export function listBanners(position?: string) {
  const q = position ? `?position=${encodeURIComponent(position)}` : '';
  return cmsFetch<CmsBanner[]>(`/cms/banners${q}`);
}

export interface PublicCmsSeoSettings {
  siteTitle: string;
  metaDescription: string;
  googleAnalyticsId: string;
  googleTagManagerId: string;
  searchConsoleVerification: string;
  robotsTxt: string;
  sitemapEnabled: boolean;
  sitemapBaseUrl: string;
  ogImageUrl: string;
}

export function getGlobalSeoSettings() {
  return cmsFetch<PublicCmsSeoSettings>('/cms/seo-settings', 0);
}
