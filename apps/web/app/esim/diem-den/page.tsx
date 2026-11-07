import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EsimPageSkeleton } from '@/components/esim/EsimCatalogClient';
import { EsimCountryDirectory } from '@/components/esim/EsimCountryDirectory';
import { listEsimPreviewOffers } from '@/lib/esim-offers';

export const metadata: Metadata = {
  title: 'Điểm đến eSIM',
  robots: { index: false, follow: false },
};

async function DirectoryLoader() {
  const result = await listEsimPreviewOffers();
  return <EsimCountryDirectory result={result} />;
}

export default function EsimDirectoryPage() {
  return (
    <Suspense fallback={<EsimPageSkeleton />}>
      <DirectoryLoader />
    </Suspense>
  );
}
