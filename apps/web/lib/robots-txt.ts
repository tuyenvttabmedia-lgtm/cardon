/** Required Disallow paths that must always appear in robots.txt (SEO Phase B). */
export const REQUIRED_ROBOTS_DISALLOWS = [
  '/checkout',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/order/',
  '/orders/',
  '/tra-cuu-don-hang',
  '/account',
  '/tai-khoan',
  '/api/',
] as const;

const DEFAULT_ROBOTS_BODY = `User-agent: *
Allow: /
Disallow: /checkout
Disallow: /login
Disallow: /register
Disallow: /forgot-password
Disallow: /reset-password
Disallow: /order/
Disallow: /orders/
Disallow: /tra-cuu-don-hang
Disallow: /account
Disallow: /tai-khoan
Disallow: /api/`;

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n').trim();
}

function hasDisallow(body: string, path: string): boolean {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^\\s*Disallow:\\s*${escaped}\\s*$`, 'im').test(body);
}

/**
 * Build final robots.txt:
 * - CMS custom text is allowed as a base
 * - Required private Disallows are always merged in
 * - Sitemap line is always present (and unique) at the end
 */
export function buildRobotsTxt(
  customRobotsTxt: string | null | undefined,
  sitemapUrl: string,
): string {
  let body = normalizeNewlines(customRobotsTxt || '') || DEFAULT_ROBOTS_BODY;

  // Drop any existing Sitemap lines — we append a canonical one.
  body = body
    .split('\n')
    .filter((line) => !/^\s*Sitemap\s*:/i.test(line))
    .join('\n')
    .trim();

  if (!/^\s*User-agent\s*:/im.test(body)) {
    body = `User-agent: *\nAllow: /\n${body}`.trim();
  }

  const missing = REQUIRED_ROBOTS_DISALLOWS.filter((path) => !hasDisallow(body, path));
  if (missing.length > 0) {
    body = `${body}\n${missing.map((p) => `Disallow: ${p}`).join('\n')}`;
  }

  return `${body.trim()}\n\nSitemap: ${sitemapUrl}\n`;
}
