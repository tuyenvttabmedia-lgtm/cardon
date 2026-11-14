import type { Metadata } from 'next';
import { TopupPageClient } from '@/components/topup/TopupPageClient';
import { listFaqs } from '@/lib/cms-api';
import { NAP_CUOC_SEO } from '@/lib/hub-seo-copy';
import { localizedMetadata } from '@/lib/seo';
import { translate } from '@/lib/i18n/messages';
import { readRequestLocale } from '@/lib/i18n/request-locale';

export function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({
    title: NAP_CUOC_SEO.title,
    description: NAP_CUOC_SEO.description,
    path: NAP_CUOC_SEO.path,
    enTitle: translate('en', 'seo.topupTitle'),
    enDescription: translate('en', 'seo.topupDescription'),
  });
}

export default async function NapCuocPage() {
  const locale = await readRequestLocale();
  const faqs = await listFaqs({ position: 'topup', limit: 10, locale });
  return <TopupPageClient initialFaqs={faqs ? faqs.items : undefined} />;
}
