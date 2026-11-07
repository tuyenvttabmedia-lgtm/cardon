import type { Metadata } from 'next';
import { DataPageClient } from '@/components/topup/DataPageClient';
import { listFaqs } from '@/lib/cms-api';
import { NAP_DATA_SEO } from '@/lib/hub-seo-copy';
import { localizedMetadata } from '@/lib/seo';
import { translate } from '@/lib/i18n/messages';

export function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({
    title: NAP_DATA_SEO.title,
    description: NAP_DATA_SEO.description,
    path: NAP_DATA_SEO.path,
    enTitle: translate('en', 'seo.dataTitle'),
    enDescription: translate('en', 'seo.dataDescription'),
  });
}

export default async function NapDataPage() {
  const faqs = await listFaqs({ position: 'data', limit: 10 });
  return <DataPageClient initialFaqs={faqs ? faqs.items : undefined} />;
}
