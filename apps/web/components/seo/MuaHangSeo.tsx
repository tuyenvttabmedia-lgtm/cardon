import { headers } from 'next/headers';
import { HubSeoJsonLd } from '@/components/seo/HubSeoJsonLd';
import { resolveHubSeoByPath } from '@/lib/hub-seo-copy';

/** SSR hub/home H1 + WebPage JSON-LD — outside CheckoutChrome Suspense to avoid duplicate markers. */
export async function MuaHangSeo() {
  const h = await headers();
  const pathname = h.get('x-pathname') ?? '/';
  const seo = resolveHubSeoByPath(pathname);
  if (!seo) return null;
  return <HubSeoJsonLd seo={seo} />;
}
