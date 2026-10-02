import type { Metadata } from 'next';
import { DataPageClient } from '@/components/topup/DataPageClient';
import { listFaqs } from '@/lib/cms-api';
import { NAP_DATA_SEO } from '@/lib/hub-seo-copy';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: NAP_DATA_SEO.title,
  description: NAP_DATA_SEO.description,
  path: NAP_DATA_SEO.path,
});

export default async function NapDataPage() {
  const faqs = await listFaqs({ position: 'data', limit: 10 });
  return <DataPageClient initialFaqs={faqs ? faqs.items : undefined} />;
}
