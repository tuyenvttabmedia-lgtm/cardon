import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HomePageClient } from '@/components/home/HomePageClient';
import { HubSeoBlock } from '@/components/seo/HubSeoBlock';
import { listBlogPosts } from '@/lib/cms-api';
import { CARD_GAME_PATH } from '@/lib/checkout-services';
import { buildMetadata } from '@/lib/seo';

const HUB_TITLE = 'Mua thẻ game giá rẻ — Garena, Zing, Steam';
const HUB_INTRO =
  'Mua thẻ Garena, Zing, Võ Lâm, Steam và nhiều nhà phát hành khác trên CardOn. Nhận mã PIN tự động 24/7, thanh toán QR an toàn, hỗ trợ đổi trả theo chính sách.';

export const metadata: Metadata = buildMetadata({
  title: HUB_TITLE,
  description:
    'Mua thẻ game Garena, Zing, Võ Lâm, Steam… giao mã tự động 24/7. Thanh toán QR an toàn tại CardOn.vn.',
  path: CARD_GAME_PATH,
});

export default async function TheGamePage() {
  const newsPosts = (await listBlogPosts({ take: 8 })) ?? [];
  return (
    <>
      <HubSeoBlock
        path={CARD_GAME_PATH}
        title={HUB_TITLE}
        intro={HUB_INTRO}
        breadcrumbLabel="Thẻ game"
      />
      <Suspense fallback={<p className="text-cardon-gray">Đang tải...</p>}>
        <HomePageClient newsPosts={newsPosts} initialCategory="game" />
      </Suspense>
    </>
  );
}
