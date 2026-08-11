import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HomePageClient } from '@/components/home/HomePageClient';
import { listBlogPosts } from '@/lib/cms-api';
import { CARD_GAME_PATH } from '@/lib/checkout-services';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Mua thẻ game giá rẻ — Garena, Zing, Steam | CardOn.vn',
  description:
    'Mua thẻ game Garena, Zing, Võ Lâm, Steam… giao mã tự động 24/7. Thanh toán QR an toàn tại CardOn.vn.',
  path: CARD_GAME_PATH,
});

export default async function TheGamePage() {
  const newsPosts = (await listBlogPosts({ take: 8 })) ?? [];
  return (
    <Suspense fallback={<p className="text-cardon-gray">Đang tải...</p>}>
      <HomePageClient newsPosts={newsPosts} initialCategory="game" />
    </Suspense>
  );
}
