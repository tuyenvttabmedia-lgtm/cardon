import { getGlobalSeoSettings } from '@/lib/cms-api';
import { getSiteUrl } from '@/lib/utils';

const DEFAULT_ROBOTS = `User-agent: *
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
Disallow: /api/

Sitemap: {sitemap}
`;

export async function GET() {
  const seo = await getGlobalSeoSettings();
  const base = seo?.sitemapBaseUrl?.trim() || getSiteUrl();
  const sitemapUrl = `${base.replace(/\/$/, '')}/sitemap.xml`;
  const body =
    seo?.robotsTxt?.trim() ||
    DEFAULT_ROBOTS.replace('{sitemap}', sitemapUrl);

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
