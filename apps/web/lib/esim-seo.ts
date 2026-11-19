import type { EsimPreviewOffer } from '@/lib/esim-offers';
import { absolutePublicUrl } from '@/lib/seo';
import { getSiteUrl } from '@/lib/utils';
import type { Locale } from '@/lib/i18n/locale';

export function esimOfferPath(offer: Pick<EsimPreviewOffer, 'id'>): string {
  return `/esim/${offer.id}`;
}

export function esimOfferCountryPath(offer: Pick<EsimPreviewOffer, 'countryIso'>): string {
  return `/esim/quoc-gia/${offer.countryIso.toUpperCase()}`;
}

export function findEsimOfferBySlug(
  offers: EsimPreviewOffer[],
  slug: string,
): { offer: EsimPreviewOffer; viaLegacy: boolean } | null {
  const bySeo = offers.find((item) => item.id === slug);
  if (bySeo) return { offer: bySeo, viaLegacy: false };
  const byLegacy = offers.find((item) => item.legacyId === slug);
  if (byLegacy) return { offer: byLegacy, viaLegacy: true };
  return null;
}

export function esimOfferSeoTitle(offer: EsimPreviewOffer, locale: Locale): string {
  if (locale === 'en') {
    return `${offer.countryName} eSIM ${offer.dataLabel} · ${offer.durationLabel} | CardOn.vn`;
  }
  return `eSIM ${offer.countryName} ${offer.dataLabel} · ${offer.durationLabel} | CardOn.vn`;
}

export function esimOfferSeoDescription(offer: EsimPreviewOffer, locale: Locale): string {
  const price =
    offer.chargeCurrency === 'USD' && offer.chargeAmount
      ? `$${offer.chargeAmount}`
      : `${offer.sellPriceVnd.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN')}₫`;
  if (locale === 'en') {
    return `Buy a ${offer.countryName} travel eSIM (${offer.dataLabel}, ${offer.durationLabel}) on CardOn.vn from ${price}. Instant QR delivery after payment.`;
  }
  return `Mua eSIM ${offer.countryName} ${offer.dataLabel}, ${offer.durationLabel} trên CardOn.vn từ ${price}. Nhận mã QR ngay sau thanh toán.`;
}

export function buildEsimOfferJsonLd(offer: EsimPreviewOffer, locale: Locale = 'vi'): Record<string, unknown> {
  const path = esimOfferPath(offer);
  const url = `${getSiteUrl()}${path}`;
  const image = absolutePublicUrl(offer.countryImageUrl || offer.photo || undefined);
  const price =
    offer.chargeCurrency === 'USD' && offer.chargeAmount
      ? { priceCurrency: 'USD', price: offer.chargeAmount }
      : { priceCurrency: 'VND', price: String(Math.round(offer.sellPriceVnd)) };

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: esimOfferSeoTitle(offer, locale).replace(/\s*\|\s*CardOn\.vn$/i, ''),
    description: esimOfferSeoDescription(offer, locale),
    url,
    sku: offer.sku || offer.id,
    category: 'Travel eSIM',
    brand: {
      '@type': 'Brand',
      name: 'CardOn',
    },
    offers: {
      '@type': 'Offer',
      url,
      ...price,
      availability: 'https://schema.org/InStock',
      seller: {
        '@type': 'Organization',
        name: 'CardOn.vn',
      },
    },
  };
  if (image) schema.image = image;
  return schema;
}
