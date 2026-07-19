import type { Metadata } from 'next';
import { Suspense } from 'react';
import { buildMetadata } from '@/lib/seo';
import CardsPageClient from './CardsPageClient';

export const metadata: Metadata = buildMetadata({
  title: 'Danh mục thẻ — CardOn.vn',
  description: 'Mua thẻ game, thẻ điện thoại với giá tốt tại CardOn.vn',
  path: '/cards',
});

export default function CardsPage() {
  return (
    <Suspense fallback={<p className="text-gray-500">Đang tải...</p>}>
      <CardsPageClient />
    </Suspense>
  );
}
