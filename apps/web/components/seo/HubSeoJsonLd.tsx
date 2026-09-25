import { BreadcrumbJsonLd } from '@/components/seo/BreadcrumbJsonLd';
import type { HubSeoCopy } from '@/lib/hub-seo-copy';
import { getSiteUrl } from '@/lib/utils';

/**
 * SEO-only markers for hub/home pages (no layout impact on checkout).
 * H1 is sr-only so CMS hero art stays clean; WebPage JSON-LD carries rich copy.
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
      <h1 className="sr-only">{seo.title}</h1>
      {crumbs ? <BreadcrumbJsonLd items={crumbs} /> : null}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPage) }}
      />
    </>
  );
}
