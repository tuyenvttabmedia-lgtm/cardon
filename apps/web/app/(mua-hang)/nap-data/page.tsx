import type { Metadata } from 'next';
import { HubSeoBlock } from '@/components/seo/HubSeoBlock';
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
      <HubSeoBlock
        path={NAP_DATA_SEO.path}
        title={NAP_DATA_SEO.title}
        intro={NAP_DATA_SEO.intro}
        paragraphs={NAP_DATA_SEO.paragraphs}
        bullets={NAP_DATA_SEO.bullets}
        breadcrumbLabel={NAP_DATA_SEO.breadcrumbLabel}
      />
      <DataPageClient />
    </>
  );
}
