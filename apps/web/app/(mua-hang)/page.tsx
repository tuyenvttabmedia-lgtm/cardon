import { Suspense } from 'react';
import { CardonHomePage } from '@/components/home/CardonHomePage';
import { readRequestLocale } from '@/lib/i18n/request-locale';
import { listBlogPosts, listFaqs } from '@/lib/cms-api';

export default async function HomePage() {
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
