import { BreadcrumbJsonLd } from '@/components/seo/BreadcrumbJsonLd';
import type { HubSeoCopy } from '@/lib/hub-seo-copy';
import { getSiteUrl } from '@/lib/utils';

/**
 * SEO-only: WebPage + Breadcrumb JSON-LD. No visible UI —
 * page H1 lives in the hero banner so checkout flow stays clean.
 */
export function HubSeoJsonLd({ seo }: { seo: HubSeoCopy }) {
  const url = `${getSiteUrl()}${seo.path === '/' ? '' : seo.path}`;
  const description = [seo.intro, ...seo.paragraphs].filter(Boolean).join(' ');

  const webPage = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: seo.title,
    description,
    url,
    isPartOf: {
      '@type': 'WebSite',
      name: 'CardOn.vn',
      url: getSiteUrl(),
    },
  };

  const crumbs =
    seo.path === '/' || !seo.breadcrumbLabel
      ? null
      : [
          { name: 'Trang chủ', url: '/' },
          { name: seo.breadcrumbLabel, url: seo.path },
        ];

  return (
    <>
      {crumbs ? <BreadcrumbJsonLd items={crumbs} /> : null}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPage) }}
      />
    </>
  );
}
