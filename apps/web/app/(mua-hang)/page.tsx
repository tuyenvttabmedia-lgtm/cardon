import { Suspense } from 'react';
import { preload } from 'react-dom';
import { CardonHomePage } from '@/components/home/CardonHomePage';
import { readRequestLocale } from '@/lib/i18n/request-locale';
import { listBlogPosts, listFaqs } from '@/lib/cms-api';
import { HOME_BACKGROUND_DEFAULTS } from '@/lib/home-backgrounds';

export default async function HomePage() {
  // Discover LCP hero before client hydrate / theme fetch.
  preload(HOME_BACKGROUND_DEFAULTS.homeHeroBg, { as: 'image', fetchPriority: 'high' });

  const locale = await readRequestLocale();
  const [newsPosts, faqs] = await Promise.all([
    listBlogPosts({ take: 8, locale }),
    listFaqs({ featured: true, limit: 6 }),
  ]);
  return (
    <Suspense fallback={<p className="site-container py-8 text-cardon-gray">Đang tải...</p>}>
      <CardonHomePage newsPosts={newsPosts ?? []} initialFaqs={faqs ? faqs.items : undefined} />
    </Suspense>
  );
}
