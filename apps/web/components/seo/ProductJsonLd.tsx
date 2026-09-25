import type { Product } from '@/types/api';
import { getSiteUrl } from '@/lib/utils';

function lowestActiveSellPrice(product: Product): number | null {
  const prices = (product.variants ?? [])
    .filter((v) => v.status === 'ACTIVE')
    .map((v) => parseFloat(v.sellPrice))
    .filter((n) => Number.isFinite(n) && n >= 0);
  if (prices.length === 0) return null;
  return Math.min(...prices);
}

export function ProductJsonLd({ product }: { product: Product }) {
  const url = `${getSiteUrl()}/product/${product.slug}`;
  const lowPrice = lowestActiveSellPrice(product);
  const image = product.bannerUrl || product.logoUrl || undefined;

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

  if (lowPrice != null) {
    schema.offers = {
      '@type': 'Offer',
      url,
      priceCurrency: 'VND',
      price: String(Math.round(lowPrice)),
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
