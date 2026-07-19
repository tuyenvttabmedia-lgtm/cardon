'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CatalogDenomCard } from '@/components/catalog/CatalogSelectCard';
import { CatalogSelectorGrid } from '@/components/catalog/CatalogSelectorGrid';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { findProductBySlug, getActiveVariants, useProducts } from '@/hooks/useProducts';
import { formatVnd } from '@/lib/utils';

export default function ProductPageClient({ slug }: { slug: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { products, loading, error } = useProducts();
  const product = findProductBySlug(products, slug);
  const variants = product ? getActiveVariants(product) : [];

  const initialVariantId = searchParams.get('variant') ?? variants[0]?.id;
  const [variantId, setVariantId] = useState(initialVariantId ?? '');
  const [quantity, setQuantity] = useState(1);

  const selectedVariant = useMemo(
    () => variants.find((v) => v.id === variantId) ?? variants[0],
    [variants, variantId],
  );

  const lineTotal = selectedVariant
    ? parseFloat(selectedVariant.sellPrice) * quantity
    : 0;

  if (loading) return <p>Đang tải sản phẩm...</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!product) return <p>Không tìm thấy sản phẩm.</p>;

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="rounded-3xl border border-gray-200 bg-white p-8">
        <p className="text-sm text-brand-600">{product.category?.name ?? 'Sản phẩm'}</p>
        <h1 className="mt-2 text-3xl font-bold">{product.name}</h1>
        {product.description && (
          <p className="mt-4 text-gray-600">{product.description}</p>
        )}
      </div>

      <div className="rounded-3xl border border-gray-200 bg-white p-8">
        <h2 className="text-lg font-semibold">Chọn mệnh giá</h2>
        <CatalogSelectorGrid className="mt-4">
          {variants.map((variant) => (
            <CatalogDenomCard
              key={variant.id}
              faceValueLabel={variant.name}
              sellPriceLabel={formatVnd(variant.sellPrice)}
              selected={selectedVariant?.id === variant.id}
              onClick={() => setVariantId(variant.id)}
            />
          ))}
        </CatalogSelectorGrid>

        <label className="mt-6 block text-sm font-medium text-gray-700">
          Số lượng
          <Input
            className="mt-1"
            type="number"
            min={1}
            max={10}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>

        <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4">
          <span className="text-gray-600">Tổng tạm tính</span>
          <span className="text-2xl font-bold text-brand-600">{formatVnd(lineTotal)}</span>
        </div>

        <Button
          className="mt-6 w-full"
          size="lg"
          disabled={!selectedVariant}
          onClick={() => {
            if (!selectedVariant) return;
            const params = new URLSearchParams({
              variantId: selectedVariant.id,
              quantity: String(quantity),
              slug: product.slug,
            });
            router.push(`/checkout?${params}`);
          }}
        >
          Mua ngay
        </Button>
      </div>
    </div>
  );
}
