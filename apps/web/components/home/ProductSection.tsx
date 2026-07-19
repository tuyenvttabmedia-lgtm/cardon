import { ProductCard } from '@/components/product/ProductCard';
import { getActiveVariants } from '@/hooks/useProducts';
import type { Product } from '@/types/api';

export function ProductSection({
  title,
  description,
  products,
  variantType,
}: {
  title: string;
  description?: string;
  products: Product[];
  variantType?: 'CARD' | 'TOPUP';
}) {
  const items = products.flatMap((product) => {
    const variants = getActiveVariants(product).filter(
      (v) => !variantType || v.type === variantType,
    );
    return variants.slice(0, 1).map((variant) => ({ product, variant }));
  });

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="mt-12">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
        {description && <p className="mt-1 text-gray-600">{description}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.slice(0, 8).map(({ product, variant }) => (
          <ProductCard key={variant.id} product={product} variant={variant} />
        ))}
      </div>
    </section>
  );
}
