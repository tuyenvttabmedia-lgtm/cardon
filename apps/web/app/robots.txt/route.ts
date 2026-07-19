import { getGlobalSeoSettings } from '@/lib/cms-api';
import { getSiteUrl } from '@/lib/utils';

const DEFAULT_ROBOTS = `User-agent: *
Allow: /

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
