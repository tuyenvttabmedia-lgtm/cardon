import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EsimCatalogClient, EsimPageSkeleton } from '@/components/esim/EsimCatalogClient';
import { translate } from '@/lib/i18n/messages';
import { readRequestLocale } from '@/lib/i18n/request-locale';
import { listEsimPreviewOffers } from '@/lib/esim-offers';
import { localizedMetadata } from '@/lib/seo';

export function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({
    title: 'eSIM du lịch quốc tế',
    path: '/esim',
    robots: { index: false, follow: false },
    enTitle: translate('en', 'seo.esimTitle'),
    enDescription: translate('en', 'seo.esimDescription'),
  });
}

async function EsimCatalogLoader() {
  const locale = await readRequestLocale();
  const result = await listEsimPreviewOffers(locale);
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
