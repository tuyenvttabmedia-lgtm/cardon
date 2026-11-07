import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { EsimDetailClient, EsimDetailSkeleton, EsimLoadError } from '@/components/esim/EsimDetailClient';
import { sanitizeEsimBack } from '@/lib/esim-browse';
import { readRequestLocale } from '@/lib/i18n/request-locale';
import { listEsimPreviewOffers } from '@/lib/esim-offers';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { localizedMetadata } = await import('@/lib/seo');
  return localizedMetadata({
    title: 'eSIM du lịch',
    path: `/esim/${slug}`,
    robots: { index: false, follow: false },
    enTitle: 'Travel eSIM',
  });
}

async function EsimDetailLoader({ slug, plansHref }: { slug: string; plansHref: string | null }) {
  const locale = await readRequestLocale();
  const result = await listEsimPreviewOffers(locale);
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
