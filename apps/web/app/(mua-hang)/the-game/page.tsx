import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HomePageClient } from '@/components/home/HomePageClient';
import { readRequestLocale } from '@/lib/i18n/request-locale';
import { listBlogPosts, listFaqs } from '@/lib/cms-api';
import { THE_GAME_SEO } from '@/lib/hub-seo-copy';
import { localizedMetadata } from '@/lib/seo';
import { translate } from '@/lib/i18n/messages';

export function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({
    title: THE_GAME_SEO.title,
    description: THE_GAME_SEO.description,
    path: THE_GAME_SEO.path,
    enTitle: translate('en', 'seo.gameTitle'),
    enDescription: translate('en', 'seo.gameDescription'),
  });
}

export default async function TheGamePage() {
  const locale = await readRequestLocale();
  const [newsPosts, faqs] = await Promise.all([
    listBlogPosts({ take: 8, locale }),
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
