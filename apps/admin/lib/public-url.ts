import { getApiBaseUrl } from '@/lib/utils';

function readEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value.replace(/\/$/, '');
  }
  return undefined;
}

function isLocalDevUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1/i.test(url);
}

function productionCustomerSiteUrl(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'admin.cardon.vn' || host.endsWith('.cardon.vn')) {
      return 'https://cardon.vn';
    }
  }
  return 'https://cardon.vn';
}

/** Customer-facing website base URL (Google/OG previews, canonical). */
export function getFrontendUrl(): string {
  const configured = readEnv(
    'NEXT_PUBLIC_FRONTEND_URL',
    'NEXT_PUBLIC_CUSTOMER_SITE_URL',
    'WEB_PUBLIC_URL',
    'NEXT_PUBLIC_WEB_SITE_URL',
  );
  if (configured && !isLocalDevUrl(configured)) return configured;
  return productionCustomerSiteUrl();
}

/** Admin panel base URL. */
export function getAdminUrl(): string {
  const configured = readEnv('NEXT_PUBLIC_ADMIN_URL', 'NEXT_PUBLIC_SITE_URL');
  if (configured && !isLocalDevUrl(configured)) return configured;
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://admin.localhost';
}

/** API base URL (`/api/v1`). */
export function getApiUrl(): string {
  return getApiBaseUrl();
}

export function buildPublicPageUrl(path: string): string {
  const base = getFrontendUrl();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

export function resolvePublicUrl(urlOrPath: string): string {
  if (!urlOrPath) return getFrontendUrl();
  if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
  return buildPublicPageUrl(urlOrPath);
}
