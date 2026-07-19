import type { Metadata } from 'next';
import { Suspense } from 'react';
import { buildMetadata } from '@/lib/seo';
import ProductPageClient from './ProductPageClient';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return buildMetadata({
    title: `${slug.replace(/-/g, ' ')} — CardOn.vn`,
    path: `/product/${slug}`,
  });
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <Suspense fallback={<p className="text-gray-500">Đang tải...</p>}>
      <ProductPageClient slug={slug} />
    </Suspense>
  );
}
