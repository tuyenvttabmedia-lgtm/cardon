import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { EsimPageSkeleton } from '@/components/esim/EsimCatalogClient';
import { EsimCountryPlans } from '@/components/esim/EsimCountryPlans';
import { readRequestLocale } from '@/lib/i18n/request-locale';
import { listEsimPreviewOffers } from '@/lib/esim-offers';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ iso: string }>;
}): Promise<Metadata> {
  const { iso } = await params;
  const { localizedMetadata } = await import('@/lib/seo');
  return localizedMetadata({
    title: 'Gói eSIM theo quốc gia',
    path: `/esim/quoc-gia/${iso}`,
    robots: { index: false, follow: false },
    enTitle: `eSIM plans · ${iso.toUpperCase()}`,
  });
}

async function PlansLoader({ iso }: { iso: string }) {
  const locale = await readRequestLocale();
  const result = await listEsimPreviewOffers(locale);
  if (!result.ok) {
    return (
      <div className="site-container py-8">
        <p className="text-sm text-red-600">{result.error}</p>
      </div>
    );
  }
  const code = iso.toUpperCase();
  const matched = result.offers.some((offer) => offer.countryIso.toUpperCase() === code);
  if (!matched) notFound();
  return <EsimCountryPlans iso={code} offers={result.offers} salesOpen={result.salesOpen} />;
}

export default async function EsimCountryPage({
  params,
}: {
  params: Promise<{ iso: string }>;
}) {
  const { iso } = await params;
  return (
    <Suspense fallback={<EsimPageSkeleton />}>
      <PlansLoader iso={iso} />
    </Suspense>
  );
}
