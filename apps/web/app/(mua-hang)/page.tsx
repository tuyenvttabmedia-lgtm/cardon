import { Suspense } from 'react';
import { HomePageClient } from '@/components/home/HomePageClient';
import { HubSeoBlock } from '@/components/seo/HubSeoBlock';
import { listBlogPosts } from '@/lib/cms-api';
import { HOME_SEO } from '@/lib/hub-seo-copy';

export default async function HomePage() {
  const newsPosts = (await listBlogPosts({ take: 8 })) ?? [];
  return (
    <>
      <HubSeoBlock
        path={HOME_SEO.path}
        title={HOME_SEO.title}
        intro={HOME_SEO.intro}
        paragraphs={HOME_SEO.paragraphs}
        bullets={HOME_SEO.bullets}
      />
      <Suspense fallback={<p className="text-cardon-gray">Đang tải...</p>}>
        <HomePageClient newsPosts={newsPosts} />
      </Suspense>
    </>
  );
}
