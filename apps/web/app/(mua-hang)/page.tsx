import { Suspense } from 'react';
import { preload } from 'react-dom';
import { CardonHomePage } from '@/components/home/CardonHomePage';
import { readRequestLocale } from '@/lib/i18n/request-locale';
import { getThemeSettings, listBlogPosts, listFaqs } from '@/lib/cms-api';
import { resolveHomeBackgrounds } from '@/lib/home-backgrounds';
import { resolveAssetUrl } from '@/lib/assets';
import { getSiteUrl } from '@/lib/utils';

export default async function HomePage() {
  const locale = await readRequestLocale();
  const [theme, newsPosts, faqs] = await Promise.all([
    getThemeSettings(),
    listBlogPosts({ take: 8, locale }),
    listFaqs({ featured: true, limit: 6 }),
  ]);

  const backgrounds = resolveHomeBackgrounds(theme?.homeBackgrounds);
  const heroPath = resolveAssetUrl(backgrounds.homeHeroBg);
  if (heroPath) {
    // Preload the URL the browser will actually request (optimizer for /uploads).
    const preloadHref = heroPath.startsWith('/uploads/')
      ? `/_next/image?url=${encodeURIComponent(`${getSiteUrl()}${heroPath}`)}&w=1080&q=65`
      : heroPath;
    preload(preloadHref, { as: 'image', fetchPriority: 'high' });
  }

  return (
    <Suspense fallback={<p className="site-container py-8 text-cardon-gray">Đang tải...</p>}>
      <CardonHomePage
        newsPosts={newsPosts ?? []}
        initialFaqs={faqs ? faqs.items : undefined}
        initialHeroBg={backgrounds.homeHeroBg}
      />
    </Suspense>
  );
}
