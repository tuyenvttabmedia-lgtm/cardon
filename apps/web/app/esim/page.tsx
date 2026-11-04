import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EsimCatalogClient, EsimPageSkeleton } from '@/components/esim/EsimCatalogClient';
import { listEsimPreviewOffers } from '@/lib/esim-offers';

export const metadata: Metadata = {
  title: 'eSIM du lịch quốc tế',
  robots: { index: false, follow: false },
};

async function EsimCatalogLoader() {
  const result = await listEsimPreviewOffers();
  return <EsimCatalogClient result={result} />;
}

export default function EsimPage() {
  return (
    <>
      <Suspense fallback={<EsimPageSkeleton />}>
        <EsimCatalogLoader />
      </Suspense>
    </>
  );
}
