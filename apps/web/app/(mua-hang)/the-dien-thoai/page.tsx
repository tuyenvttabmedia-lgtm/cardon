import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HomePageClient } from '@/components/home/HomePageClient';
import { HubSeoBlock } from '@/components/seo/HubSeoBlock';
import { listBlogPosts } from '@/lib/cms-api';
import { CARD_PHONE_PATH } from '@/lib/checkout-services';
import { buildMetadata } from '@/lib/seo';

const HUB_TITLE = 'Mua thẻ điện thoại Viettel, Mobifone, Vinaphone';
const HUB_INTRO =
  'Mua thẻ cào Viettel, Mobifone, Vinaphone, Vietnamobile trên CardOn. Nhận mã PIN tức thì, nhiều mệnh giá, thanh toán online an toàn và giao dịch tự động 24/7.';

export const metadata: Metadata = buildMetadata({
  title: HUB_TITLE,
  description:
    'Mua thẻ cào điện thoại Viettel, Mobifone, Vinaphone, Vietnamobile giá tốt. Nhận mã PIN tức thì tại CardOn.vn.',
  path: CARD_PHONE_PATH,
});

export default async function TheDienThoaiPage() {
  const newsPosts = (await listBlogPosts({ take: 8 })) ?? [];
  return (
    <>
      <HubSeoBlock
        path={CARD_PHONE_PATH}
        title={HUB_TITLE}
        intro={HUB_INTRO}
        breadcrumbLabel="Thẻ điện thoại"
      />
      <Suspense fallback={<p className="text-cardon-gray">Đang tải...</p>}>
        <HomePageClient newsPosts={newsPosts} initialCategory="phone" />
      </Suspense>
    </>
  );
}
