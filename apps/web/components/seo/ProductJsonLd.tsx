import { absolutePublicUrl } from '@/lib/seo';
import type { Product } from '@/types/api';
import { getSiteUrl } from '@/lib/utils';

/** Telco / game publishers commonly sold on CardOn — matched against name/slug/category. */
const KNOWN_BRANDS = [
  'Garena',
  'Zing',
  'Steam',
  'Gosu',
  'Funcard',
  'Sohacoin',
  'Appota',
  'Vcoin',
  'VTC',
  'Scoin',
  'Kul',
  'Gate',
  'Roblox',
  'Viettel',
  'Mobifone',
  'Vinaphone',
  'Vietnamobile',
  'Gmobile',
  'ITelecom',
  'Wintel',
] as const;

export function resolveProductBrand(product: Product): string {
  const haystack = `${product.name} ${product.slug} ${product.category?.name ?? ''}`;
  for (const brand of KNOWN_BRANDS) {
    if (new RegExp(`\\b${brand}\\b`, 'i').test(haystack) || new RegExp(brand, 'i').test(haystack)) {
      return brand;
    }
  }

  const cleaned = product.name
    .replace(/^(mua|thẻ|the|nạp|nap)\s+/i, '')
    .trim();
  const first = cleaned.split(/\s+/)[0];
  if (first && first.length >= 2 && !/^(card|game|data|cước|cuoc)$/i.test(first)) {
    return first;
  }

  const category = product.category?.name?.replace(/^THẺ\s+/i, '').trim();
  if (category) return category;

  return 'CardOn';
}

function activeSellPrices(product: Product): number[] {
  return (product.variants ?? [])
    .filter((v) => v.status === 'ACTIVE')
    .map((v) => parseFloat(v.sellPrice))
    .filter((n) => Number.isFinite(n) && n >= 0);
}

export function ProductJsonLd({ product }: { product: Product }) {
  const url = `${getSiteUrl()}/product/${product.slug}`;
  const prices = activeSellPrices(product);
  const image = absolutePublicUrl(product.bannerUrl || product.logoUrl);
  const brandName = resolveProductBrand(product);

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description || product.name,
    url,
    sku: product.slug,
    brand: {
      '@type': 'Brand',
      name: brandName,
    },
  };

  if (image) {
    schema.image = image;
  }

  if (product.category?.name) {
    schema.category = product.category.name;
  }

  if (prices.length === 1) {
    schema.offers = {
      '@type': 'Offer',
      url,
      priceCurrency: 'VND',
      price: String(Math.round(prices[0])),
      availability: 'https://schema.org/InStock',
      seller: {
        '@type': 'Organization',
        name: 'CardOn.vn',
      },
    };
  } else if (prices.length > 1) {
    const low = Math.min(...prices);
    const high = Math.max(...prices);
    schema.offers = {
      '@type': 'AggregateOffer',
      url,
      priceCurrency: 'VND',
      lowPrice: String(Math.round(low)),
      highPrice: String(Math.round(high)),
      offerCount: prices.length,
      availability: 'https://schema.org/InStock',
      seller: {
        '@type': 'Organization',
        name: 'CardOn.vn',
      },
    };
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
