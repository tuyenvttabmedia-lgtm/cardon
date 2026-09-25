import type { Product } from '@/types/api';
import { getSiteUrl } from '@/lib/utils';

function absoluteMediaUrl(path: string | null | undefined): string | undefined {
  if (!path?.trim()) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  const base = getSiteUrl();
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
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
  const image = absoluteMediaUrl(product.bannerUrl || product.logoUrl);

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description || product.name,
    url,
    sku: product.slug,
    brand: {
      '@type': 'Brand',
      name: 'CardOn',
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
