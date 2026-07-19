'use client';

import { useCallback, useEffect, useState } from 'react';
import { productApi } from '@/services/api-client';
import type { Product } from '@/types/api';

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await productApi.listProducts();
      setProducts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được sản phẩm');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { products, loading, error, refresh };
}

export function findProductBySlug(products: Product[], slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}

export function getActiveVariants(product: Product) {
  return (product.variants ?? []).filter((v) => v.status === 'ACTIVE');
}

export function filterProductsByVariantType(
  products: Product[],
  type: 'CARD' | 'TOPUP' | 'DATA',
) {
  return products.filter((p) =>
    (p.variants ?? []).some((v) => v.type === type && v.status === 'ACTIVE'),
  );
}
