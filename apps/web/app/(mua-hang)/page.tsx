import { Suspense } from 'react';
import { HomePageClient } from '@/components/home/HomePageClient';
import { HubSeoBlock } from '@/components/seo/HubSeoBlock';
import { listBlogPosts } from '@/lib/cms-api';

const HOME_TITLE = 'Mua thẻ game, thẻ điện thoại & nạp cước online';
const HOME_INTRO =
  'CardOn.vn cung cấp thẻ game, thẻ điện thoại, nạp cước và nạp data 4G/5G trực tuyến. Giao mã / cộng cước tự động 24/7, thanh toán QR an toàn.';

export default async function HomePage() {
  const newsPosts = (await listBlogPosts({ take: 8 })) ?? [];
  return (
    <>
      <HubSeoBlock path="/" title={HOME_TITLE} intro={HOME_INTRO} />
      <Suspense fallback={<p className="text-cardon-gray">Đang tải...</p>}>
        <HomePageClient newsPosts={newsPosts} />
      </Suspense>
    </>
  );
}
