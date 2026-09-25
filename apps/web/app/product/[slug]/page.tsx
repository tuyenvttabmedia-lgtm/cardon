import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BreadcrumbJsonLd } from '@/components/seo/BreadcrumbJsonLd';
import { ProductJsonLd } from '@/components/seo/ProductJsonLd';
import { getProductBySlug } from '@/lib/product-api';
import { buildMetadata } from '@/lib/seo';
import ProductPageClient from './ProductPageClient';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) {
    return buildMetadata({
      title: 'Sản phẩm',
      path: `/product/${slug}`,
    });
  }

  const description =
    product.description?.trim() ||
    `Mua ${product.name} giá tốt, giao nhanh tại CardOn.vn`;
  const ogImage = product.bannerUrl || product.logoUrl || undefined;

  return buildMetadata({
    title: product.name,
    description,
    path: `/product/${product.slug}`,
    ogImage,
  });
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  return (
    <>
      {product ? (
        <>
          <ProductJsonLd product={product} />
          <BreadcrumbJsonLd
            items={[
              { name: 'Trang chủ', url: '/' },
              ...(product.category?.name
                ? [
                    {
                      name: product.category.name,
                      url:
                        product.homeService === 'PHONE_CARD'
                          ? '/the-dien-thoai'
                          : product.homeService === 'TOPUP'
                            ? '/nap-cuoc'
                            : product.homeService === 'DATA'
                              ? '/nap-data'
                              : '/the-game',
                    },
                  ]
                : []),
              { name: product.name },
            ]}
          />
        </>
      ) : null}
      <Suspense fallback={<p className="text-gray-500">Đang tải...</p>}>
        <ProductPageClient slug={slug} />
      </Suspense>
    </>
  );
}
