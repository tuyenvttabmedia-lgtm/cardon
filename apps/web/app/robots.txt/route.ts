import { getGlobalSeoSettings } from '@/lib/cms-api';
import { buildRobotsTxt } from '@/lib/robots-txt';
import { getSiteUrl } from '@/lib/utils';

export async function GET() {
  const seo = await getGlobalSeoSettings();
  const base = (seo?.sitemapBaseUrl?.trim() || getSiteUrl()).replace(/\/$/, '');
  const sitemapUrl = `${base}/sitemap.xml`;
  const body = buildRobotsTxt(seo?.robotsTxt, sitemapUrl);

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
