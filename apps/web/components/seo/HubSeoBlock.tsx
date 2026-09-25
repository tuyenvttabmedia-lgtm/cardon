import { BreadcrumbJsonLd } from '@/components/seo/BreadcrumbJsonLd';
import { getSiteUrl } from '@/lib/utils';

export type HubSeoContent = {
  path: string;
  title: string;
  intro: string;
  /** Omit or pass null to skip BreadcrumbList (e.g. homepage). */
  breadcrumbLabel?: string | null;
};

/** Visible H1 + intro + WebPage/Breadcrumb JSON-LD so hub/home pages are not thin. */
export function HubSeoBlock({ path, title, intro, breadcrumbLabel }: HubSeoContent) {
  const url = `${getSiteUrl()}${path === '/' ? '' : path}`;
  const webPage = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description: intro,
    url,
    isPartOf: {
      '@type': 'WebSite',
      name: 'CardOn.vn',
      url: getSiteUrl(),
    },
  };

  const crumbs =
    path === '/' || !breadcrumbLabel
      ? null
      : [
          { name: 'Trang chủ', url: '/' },
          { name: breadcrumbLabel, url: path },
        ];

  return (
    <section className="border-b border-zinc-100 bg-zinc-50/80 py-5 md:py-6">
      {crumbs ? <BreadcrumbJsonLd items={crumbs} /> : null}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPage) }}
      />
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600 md:text-base">{intro}</p>
    </section>
  );
}
