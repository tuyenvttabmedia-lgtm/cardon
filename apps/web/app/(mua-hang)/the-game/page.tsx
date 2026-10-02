import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HomePageClient } from '@/components/home/HomePageClient';
import { listBlogPosts, listFaqs } from '@/lib/cms-api';
import { THE_GAME_SEO } from '@/lib/hub-seo-copy';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: THE_GAME_SEO.title,
  description: THE_GAME_SEO.description,
  path: THE_GAME_SEO.path,
});

export default async function TheGamePage() {
  const [newsPosts, faqs] = await Promise.all([
    listBlogPosts({ take: 8 }),
    listFaqs({ featured: true, limit: 10 }),
  ]);
  return (
    <Suspense fallback={<p className="text-cardon-gray">Đang tải...</p>}>
      <HomePageClient
        newsPosts={newsPosts ?? []}
        initialCategory="game"
        initialFaqs={faqs ? faqs.items : undefined}
      />
    </Suspense>
  );
}
