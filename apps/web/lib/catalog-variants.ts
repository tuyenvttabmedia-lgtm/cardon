import { getActiveVariants } from '@/hooks/useProducts';
import { sortedVariantsByFaceValue } from '@/lib/topup-flow';
import type { Product, ProductVariant } from '@/types/api';

export type CatalogVariantOption = {
  variant: ProductVariant;
  product: Product;
};

export function collectCatalogVariants(
  products: Product[],
  variantType: 'CARD' | 'TOPUP' | 'DATA',
  productFilter?: Product | null,
): CatalogVariantOption[] {
  if (!productFilter) return [];

  const source = [productFilter];
  const options: CatalogVariantOption[] = [];

  for (const product of source) {
    for (const variant of getActiveVariants(product)) {
      if (variant.type === variantType) {
        options.push({ variant, product });
      }
    }
  }

  if (variantType === 'DATA') {
    return options.sort(
      (a, b) => parseFloat(a.variant.faceValue) - parseFloat(b.variant.faceValue),
    );
  }

  return sortedVariantsByFaceValue(options.map((o) => o.variant)).map((variant) => {
    const product = source.find((p) =>
      getActiveVariants(p).some((item) => item.id === variant.id),
    );
    return { variant, product: product! };
  });
}

export function findProductForVariant(
  products: Product[],
  variantId: string | null | undefined,
): Product | null {
  if (!variantId) return null;
  return (
    products.find((p) => getActiveVariants(p).some((v) => v.id === variantId)) ?? null
  );
}

export function variantStillInCatalog(
  options: CatalogVariantOption[],
  variantId: string | null | undefined,
): boolean {
  if (!variantId) return false;
  return options.some((o) => o.variant.id === variantId);
}
