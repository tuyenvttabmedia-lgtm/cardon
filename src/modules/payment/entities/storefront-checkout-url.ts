export type StorefrontLocale = 'vi' | 'en';

/** Read checkout locale from order.clientTrace. Missing values stay Vietnamese. */
export function readOrderCheckoutLocale(clientTrace: unknown): StorefrontLocale {
  if (!clientTrace || typeof clientTrace !== 'object' || Array.isArray(clientTrace)) return 'vi';
  return (clientTrace as { locale?: unknown }).locale === 'en' ? 'en' : 'vi';
}

function isSafeStorefrontPath(pathname: string): boolean {
  if (!pathname.startsWith('/') || pathname.startsWith('//')) return false;
  if (pathname.includes('://') || pathname.includes('\\') || pathname.includes('\0')) return false;
  if (pathname.includes('..') || pathname.includes('?') || pathname.includes('#')) return false;
  return true;
}

/**
 * Absolute storefront URL with optional /en prefix.
 * publicUrl is the site origin only (no trailing slash).
 * Pathname must be a same-origin relative path (no open-redirect tricks).
 */
export function storefrontCheckoutUrl(
  publicUrl: string,
  locale: StorefrontLocale,
  pathname: string,
  query?: Record<string, string>,
): string {
  const base = publicUrl.replace(/\/$/, '');
  const bare = pathname.startsWith('/') ? pathname : `/${pathname}`;
  if (!isSafeStorefrontPath(bare)) {
    throw new Error('Invalid storefront checkout path');
  }
  const localized = locale === 'en' ? `/en${bare === '/' ? '' : bare}` : bare;
  const qs = query
    ? `?${Object.entries(query)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&')}`
    : '';
  return `${base}${localized || '/'}${qs}`;
}
