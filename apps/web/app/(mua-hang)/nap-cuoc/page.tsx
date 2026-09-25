import type { Metadata } from 'next';
import { HubSeoJsonLd } from '@/components/seo/HubSeoJsonLd';
import { TopupPageClient } from '@/components/topup/TopupPageClient';
import { NAP_CUOC_SEO } from '@/lib/hub-seo-copy';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: NAP_CUOC_SEO.title,
  description: NAP_CUOC_SEO.description,
  path: NAP_CUOC_SEO.path,
});

export default function NapCuocPage() {
  return (
    <>
      <HubSeoJsonLd seo={NAP_CUOC_SEO} />
      <TopupPageClient />
    </>
  );
}
