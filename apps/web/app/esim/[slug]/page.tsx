import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { EsimDetailClient, EsimDetailSkeleton, EsimLoadError } from '@/components/esim/EsimDetailClient';
import { sanitizeEsimBack } from '@/lib/esim-browse';
import { listEsimPreviewOffers } from '@/lib/esim-offers';

export const metadata: Metadata = {
  title: 'eSIM du lịch',
  robots: { index: false, follow: false },
};

async function EsimDetailLoader({ slug, plansHref }: { slug: string; plansHref: string | null }) {
  const result = await listEsimPreviewOffers();
  if (!result.ok) {
    return <EsimLoadError message={result.error} />;
  }
  const offer = result.offers.find((item) => item.id === slug);
  if (!offer) {
    notFound();
  }
  return (
    <EsimDetailClient
      offer={offer}
      offers={result.offers}
      plansHref={plansHref}
      salesOpen={result.salesOpen}
    />
  );
}

export default async function EsimDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ back?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const plansHref = sanitizeEsimBack(query.back);
  return (
    <div className="site-container py-6 md:py-8">
      <Suspense fallback={<EsimDetailSkeleton />}>
        <EsimDetailLoader slug={slug} plansHref={plansHref} />
      </Suspense>
    </div>
  );
}
