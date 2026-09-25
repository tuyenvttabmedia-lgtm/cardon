import { Suspense } from 'react';
import { HomePageClient } from '@/components/home/HomePageClient';
import { HubSeoJsonLd } from '@/components/seo/HubSeoJsonLd';
import { listBlogPosts } from '@/lib/cms-api';
import { HOME_SEO } from '@/lib/hub-seo-copy';

export default async function HomePage() {
  const newsPosts = (await listBlogPosts({ take: 8 })) ?? [];
  return (
    <>
      <HubSeoJsonLd seo={HOME_SEO} />
      <Suspense fallback={<p className="text-cardon-gray">Đang tải...</p>}>
        <HomePageClient newsPosts={newsPosts} />
      </Suspense>
    </>
  );
}
