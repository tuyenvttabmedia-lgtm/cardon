import Link from 'next/link';
import { formatVnd } from '@/lib/utils';
import type { Product, ProductVariant } from '@/types/api';

export function ProductCard({
  product,
  variant,
}: {
  product: Product;
  variant: ProductVariant;
}) {
  return (
    <Link
      href={`/product/${product.slug}?variant=${variant.id}`}
      className="group rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
    >
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-100 text-lg font-bold text-brand-700">
        {product.name.charAt(0)}
      </div>
      <h3 className="font-semibold text-gray-900 group-hover:text-brand-700">
        {product.name}
      </h3>
      <p className="mt-1 text-sm text-gray-500">{variant.name}</p>
      <p className="mt-3 text-lg font-bold text-brand-600">
        {formatVnd(variant.sellPrice)}
      </p>
    </Link>
  );
}
