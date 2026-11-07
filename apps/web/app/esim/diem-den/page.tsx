import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EsimPageSkeleton } from '@/components/esim/EsimCatalogClient';
import { EsimCountryDirectory } from '@/components/esim/EsimCountryDirectory';
import { readRequestLocale } from '@/lib/i18n/request-locale';
import { listEsimPreviewOffers } from '@/lib/esim-offers';

import { localizedMetadata } from '@/lib/seo';

export function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({
    title: 'Điểm đến eSIM',
    path: '/esim/diem-den',
    robots: { index: false, follow: false },
    enTitle: 'eSIM destinations',
  });
}

async function DirectoryLoader() {
  const locale = await readRequestLocale();
  const result = await listEsimPreviewOffers(locale);
  return <EsimCountryDirectory result={result} />;
}

export default function EsimDirectoryPage() {
  return (
    <Suspense fallback={<EsimPageSkeleton />}>
      <DirectoryLoader />
    </Suspense>
  );
}
