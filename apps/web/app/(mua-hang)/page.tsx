import { Suspense } from 'react';
import { HomePageClient } from '@/components/home/HomePageClient';
import { listBlogPosts } from '@/lib/cms-api';

export default async function HomePage() {
  const newsPosts = (await listBlogPosts({ take: 8 })) ?? [];
  return (
    <Suspense fallback={<p className="text-cardon-gray">Đang tải...</p>}>
      <HomePageClient newsPosts={newsPosts} />
    </Suspense>
  );
}
