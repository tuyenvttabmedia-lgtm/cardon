import type { Metadata } from 'next';
import { TopupPageClient } from '@/components/topup/TopupPageClient';
import { listFaqs } from '@/lib/cms-api';
import { NAP_CUOC_SEO } from '@/lib/hub-seo-copy';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: NAP_CUOC_SEO.title,
  description: NAP_CUOC_SEO.description,
  path: NAP_CUOC_SEO.path,
});

export default async function NapCuocPage() {
  const faqs = await listFaqs({ position: 'topup', limit: 10 });
  return <TopupPageClient initialFaqs={faqs ? faqs.items : undefined} />;
}
