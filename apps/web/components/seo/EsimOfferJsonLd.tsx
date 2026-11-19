import { BreadcrumbJsonLd } from '@/components/seo/BreadcrumbJsonLd';
import { safeJsonLd } from '@/lib/safe-json-ld';
import {
  buildEsimOfferJsonLd,
  esimOfferCountryPath,
  esimOfferPath,
} from '@/lib/esim-seo';
import type { EsimPreviewOffer } from '@/lib/esim-offers';
import type { Locale } from '@/lib/i18n/locale';

export function EsimOfferJsonLd({
  offer,
  locale = 'vi',
}: {
  offer: EsimPreviewOffer;
  locale?: Locale;
}) {
  const schema = buildEsimOfferJsonLd(offer, locale);
  const crumbs = [
    { name: locale === 'en' ? 'Home' : 'Trang chủ', url: '/' },
    { name: 'eSIM', url: '/esim' },
    { name: offer.countryName, url: esimOfferCountryPath(offer) },
    { name: `${offer.dataLabel} · ${offer.durationLabel}`, url: esimOfferPath(offer) },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(schema) }} />
      <BreadcrumbJsonLd items={crumbs} />
    </>
  );
}
