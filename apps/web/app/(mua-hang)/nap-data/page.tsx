import type { Metadata } from 'next';
import { HubSeoJsonLd } from '@/components/seo/HubSeoJsonLd';
import { DataPageClient } from '@/components/topup/DataPageClient';
import { NAP_DATA_SEO } from '@/lib/hub-seo-copy';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: NAP_DATA_SEO.title,
  description: NAP_DATA_SEO.description,
  path: NAP_DATA_SEO.path,
});

export default function NapDataPage() {
  return (
    <>
      <HubSeoJsonLd seo={NAP_DATA_SEO} />
      <DataPageClient />
    </>
  );
}
