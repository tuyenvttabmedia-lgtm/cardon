import { getSiteUrl } from '@/lib/utils';

export type BreadcrumbJsonLdItem = {
  name: string;
  /** Absolute or site-relative URL. Omit for the current (last) crumb. */
  url?: string;
};

export function BreadcrumbJsonLd({ items }: { items: BreadcrumbJsonLdItem[] }) {
  if (items.length === 0) return null;

  const site = getSiteUrl();
  const list = items.map((item, index) => {
    const entry: Record<string, unknown> = {
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
    };
    if (item.url) {
      entry.item = item.url.startsWith('http')
        ? item.url
        : `${site}${item.url.startsWith('/') ? '' : '/'}${item.url}`;
    }
    return entry;
  });

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: list,
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
