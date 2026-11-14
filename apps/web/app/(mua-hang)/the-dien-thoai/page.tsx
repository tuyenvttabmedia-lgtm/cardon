import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HomePageClient } from '@/components/home/HomePageClient';
import { listFaqs } from '@/lib/cms-api';
import { THE_PHONE_SEO } from '@/lib/hub-seo-copy';
import { localizedMetadata } from '@/lib/seo';
import { translate } from '@/lib/i18n/messages';
import { readRequestLocale } from '@/lib/i18n/request-locale';

export function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({
    title: THE_PHONE_SEO.title,
    description: THE_PHONE_SEO.description,
    path: THE_PHONE_SEO.path,
    enTitle: translate('en', 'seo.phoneTitle'),
    enDescription: translate('en', 'seo.phoneDescription'),
  });
}

export default async function TheDienThoaiPage() {
  const locale = await readRequestLocale();
  const faqs = await listFaqs({ featured: true, limit: 10, locale });
  return (
    <Suspense fallback={<p className="text-cardon-gray">Đang tải...</p>}>
      <HomePageClient
        initialCategory="phone"
        initialFaqs={faqs ? faqs.items : undefined}
      />
    </Suspense>
  );
}
