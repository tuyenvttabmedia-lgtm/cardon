export const PARTNER_SESSION_COOKIE = 'cardon_partner_session';

export const PARTNER_PUBLIC_PATHS = new Set(['/login', '/verify-email']);

export const PARTNER_LEGACY_REDIRECTS: Record<string, string> = {
  '/balance': '/wallet',
  '/transactions': '/orders/search',
  '/api-keys': '/api/keys',
  '/webhooks': '/api/webhook',
  '/api': '/api/keys',
  '/kyc': '/account/kyc',
  '/docs': '/api/docs',
  '/settings': '/account',
  '/settings/kyc': '/account/kyc',
  '/wallet/transactions': '/wallet/ledger',
  '/wallet/deposits': '/finance/deposits',
  '/wallet/withdraws': '/wallet',
  '/wallet/limits': '/coming-soon',
  '/settlement': '/finance/settlements',
  '/finance': '/wallet',
  '/finance/adjustments': '/coming-soon',
  '/finance/credit': '/coming-soon',
  '/finance/withdraws': '/wallet',
  '/finance/history': '/coming-soon',
  '/products': '/coming-soon',
  '/users': '/coming-soon',
  '/support': '/coming-soon',
  '/orders': '/orders/search',
  '/orders/webhooks': '/api/webhook',
  '/orders/logs': '/api/logs',
  '/orders/export': '/orders/history',
};

export const PARTNER_PLATFORM_PREFIXES = [
  '/dashboard',
  '/wallet',
  '/finance/deposits',
  '/finance/settlements',
  '/orders',
  '/reports',
  '/api',
  '/invoices',
  '/account',
  '/notifications',
  '/coming-soon',
];

export function isPartnerPlatformPath(pathname: string): boolean {
  return PARTNER_PLATFORM_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function partnerCookieAttrs(): string {
  const secure =
    typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  return `path=/; SameSite=Lax${secure}`;
}

export function setPartnerSessionCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${PARTNER_SESSION_COOKIE}=1; ${partnerCookieAttrs()}; max-age=${60 * 60 * 24 * 7}`;
}

export function clearPartnerSessionCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${PARTNER_SESSION_COOKIE}=; ${partnerCookieAttrs()}; max-age=0`;
}

export function hasPartnerSessionCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split(';').some((c) => c.trim().startsWith(`${PARTNER_SESSION_COOKIE}=1`));
}
