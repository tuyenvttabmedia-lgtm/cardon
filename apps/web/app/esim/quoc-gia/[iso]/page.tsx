import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { EsimPageSkeleton } from '@/components/esim/EsimCatalogClient';
import { EsimCountryPlans } from '@/components/esim/EsimCountryPlans';
import { listEsimPreviewOffers } from '@/lib/esim-offers';

export const metadata: Metadata = {
  title: 'Gói eSIM theo quốc gia',
  robots: { index: false, follow: false },
};

async function PlansLoader({ iso }: { iso: string }) {
  const result = await listEsimPreviewOffers();
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
