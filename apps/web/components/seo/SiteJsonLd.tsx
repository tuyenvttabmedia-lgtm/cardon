import { absolutePublicUrl } from '@/lib/seo';
import type { PublicCmsSeoSettings } from '@/lib/cms-api';
import { SITE_DESCRIPTION, SITE_NAME, getSiteUrl } from '@/lib/utils';

export function SiteJsonLd({
  seo,
  logoUrl,
}: {
  seo?: PublicCmsSeoSettings | null;
  logoUrl?: string | null;
}) {
  const siteUrl = getSiteUrl();
  const name = seo?.siteTitle?.trim() || SITE_NAME;
  const description = seo?.metaDescription?.trim() || SITE_DESCRIPTION;
  const logo =
    absolutePublicUrl(logoUrl) ?? `${siteUrl}/images/cardon-logo-full.png`;

  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'CardOn',
    url: siteUrl,
    logo,
    description,
  };

  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name,
    url: siteUrl,
    description,
    publisher: {
      '@type': 'Organization',
      name: 'CardOn',
    },
    potentialAction: {
      '@type': 'SearchAction',
      target: `${siteUrl}/tin-tuc?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }}
      />
    </>
  );
}
