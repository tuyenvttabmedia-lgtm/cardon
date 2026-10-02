import { Suspense } from 'react';
import { HomePageClient } from '@/components/home/HomePageClient';
import { listBlogPosts, listFaqs } from '@/lib/cms-api';

export default async function HomePage() {
  const [newsPosts, faqs] = await Promise.all([
    listBlogPosts({ take: 8 }),
    listFaqs({ featured: true, limit: 10 }),
  ]);
  return (
    <Suspense fallback={<p className="text-cardon-gray">Đang tải...</p>}>
      <HomePageClient
        newsPosts={newsPosts ?? []}
        initialFaqs={faqs ? faqs.items : undefined}
      />
    </Suspense>
  );
}
