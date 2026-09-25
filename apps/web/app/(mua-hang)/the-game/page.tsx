import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HomePageClient } from '@/components/home/HomePageClient';
import { HubSeoBlock } from '@/components/seo/HubSeoBlock';
import { listBlogPosts } from '@/lib/cms-api';
import { THE_GAME_SEO } from '@/lib/hub-seo-copy';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: THE_GAME_SEO.title,
  description: THE_GAME_SEO.description,
  path: THE_GAME_SEO.path,
});

export default async function TheGamePage() {
  const newsPosts = (await listBlogPosts({ take: 8 })) ?? [];
  return (
    <>
      <HubSeoBlock
        path={THE_GAME_SEO.path}
        title={THE_GAME_SEO.title}
        intro={THE_GAME_SEO.intro}
        paragraphs={THE_GAME_SEO.paragraphs}
        bullets={THE_GAME_SEO.bullets}
        breadcrumbLabel={THE_GAME_SEO.breadcrumbLabel}
      />
      <Suspense fallback={<p className="text-cardon-gray">Đang tải...</p>}>
        <HomePageClient newsPosts={newsPosts} initialCategory="game" />
      </Suspense>
    </>
  );
}
