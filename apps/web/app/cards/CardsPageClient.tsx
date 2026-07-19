'use client';



import { useMemo } from 'react';

import { useSearchParams } from 'next/navigation';

import { ProductCard } from '@/components/product/ProductCard';

import { homeCategoryToHomeService } from '@/lib/home-catalog';

import { getActiveVariants, useProducts } from '@/hooks/useProducts';

import type { HomeServiceType } from '@/types/api';



export default function CardsPageClient() {

  const searchParams = useSearchParams();

  const serviceFilter = searchParams.get('service') as HomeServiceType | null;

  const categoryFilter = searchParams.get('category');

  const { products, loading, error } = useProducts();



  const filtered = useMemo(() => {

    return products.flatMap((product) => {

      if (categoryFilter && product.category?.slug !== categoryFilter) {

        return [];

      }

      if (serviceFilter && product.homeService !== serviceFilter) {

        return [];

      }

      const variants = getActiveVariants(product);

      return variants.map((variant) => ({ product, variant }));

    });

  }, [products, serviceFilter, categoryFilter]);



  return (

    <div>

      <h1 className="text-3xl font-bold text-gray-900">Danh mục thẻ</h1>

      <p className="mt-2 text-gray-600">Chọn sản phẩm và mệnh giá phù hợp</p>



      <div className="mt-6 flex flex-wrap gap-2">

        <a

          href="/cards"

          className={`rounded-full px-4 py-1.5 text-sm ${!serviceFilter ? 'bg-brand-600 text-white' : 'border border-gray-200 bg-white'}`}

        >

          Tất cả

        </a>

        <a

          href={`/cards?service=${homeCategoryToHomeService('game')}`}

          className={`rounded-full px-4 py-1.5 text-sm ${serviceFilter === 'GAME_CARD' ? 'bg-brand-600 text-white' : 'border border-gray-200 bg-white'}`}

        >

          Thẻ game

        </a>

        <a

          href={`/cards?service=${homeCategoryToHomeService('phone')}`}

          className={`rounded-full px-4 py-1.5 text-sm ${serviceFilter === 'PHONE_CARD' ? 'bg-brand-600 text-white' : 'border border-gray-200 bg-white'}`}

        >

          Thẻ điện thoại

        </a>

        <a

          href={`/cards?service=${homeCategoryToHomeService('topup')}`}

          className={`rounded-full px-4 py-1.5 text-sm ${serviceFilter === 'TOPUP' ? 'bg-brand-600 text-white' : 'border border-gray-200 bg-white'}`}

        >

          Nạp cước

        </a>

      </div>



      {loading && <p className="mt-8 text-gray-500">Đang tải...</p>}

      {error && <p className="mt-8 text-red-600">{error}</p>}



      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

        {filtered.map(({ product, variant }) => (

          <ProductCard key={variant.id} product={product} variant={variant} />

        ))}

      </div>



      {!loading && filtered.length === 0 && (

        <p className="mt-8 text-center text-gray-500">Không có sản phẩm phù hợp.</p>

      )}

    </div>

  );

}


