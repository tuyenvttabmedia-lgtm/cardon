import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HomePageClient } from '@/components/home/HomePageClient';
import { listBlogPosts } from '@/lib/cms-api';
import { CARD_PHONE_PATH } from '@/lib/checkout-services';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Mua thẻ điện thoại Viettel, Mobifone, Vinaphone | CardOn.vn',
  description:
    'Mua thẻ cào điện thoại Viettel, Mobifone, Vinaphone, Vietnamobile giá tốt. Nhận mã PIN tức thì tại CardOn.vn.',
  path: CARD_PHONE_PATH,
});

export default async function TheDienThoaiPage() {
  const newsPosts = (await listBlogPosts({ take: 8 })) ?? [];
  return (
    <Suspense fallback={<p className="text-cardon-gray">Đang tải...</p>}>
      <HomePageClient newsPosts={newsPosts} initialCategory="phone" />
    </Suspense>
  );
}
