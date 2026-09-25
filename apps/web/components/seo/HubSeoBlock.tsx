import { BreadcrumbJsonLd } from '@/components/seo/BreadcrumbJsonLd';
import { getSiteUrl } from '@/lib/utils';

export type HubSeoContent = {
  path: string;
  title: string;
  intro: string;
  /** Extra paragraphs under intro for content depth. */
  paragraphs?: string[];
  /** Short benefit bullets. */
  bullets?: string[];
  /** Omit or pass null to skip BreadcrumbList (e.g. homepage). */
  breadcrumbLabel?: string | null;
};

/** Visible H1 + rich intro + WebPage/Breadcrumb JSON-LD. */
export function HubSeoBlock({
  path,
  title,
  intro,
  paragraphs = [],
  bullets = [],
  breadcrumbLabel,
}: HubSeoContent) {
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
      {paragraphs.map((text) => (
        <p
          key={text.slice(0, 48)}
          className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-600 md:text-base"
        >
          {text}
        </p>
      ))}
      {bullets.length > 0 ? (
        <ul className="mt-4 max-w-3xl list-disc space-y-1.5 pl-5 text-sm text-zinc-700 md:text-base">
          {bullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
