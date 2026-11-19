import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { Suspense } from 'react';
import { EsimDetailClient, EsimDetailSkeleton, EsimLoadError } from '@/components/esim/EsimDetailClient';
import { EsimOfferJsonLd } from '@/components/seo/EsimOfferJsonLd';
import { countryPlansHref } from '@/lib/esim-browse';
import {
  esimOfferCountryPath,
  esimOfferPath,
  esimOfferSeoDescription,
  esimOfferSeoTitle,
  findEsimOfferBySlug,
} from '@/lib/esim-seo';
import { listEsimPreviewOffers } from '@/lib/esim-offers';
import { readRequestLocale } from '@/lib/i18n/request-locale';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const locale = await readRequestLocale();
  const result = await listEsimPreviewOffers(locale);
  const { localizedMetadata } = await import('@/lib/seo');
  if (!result.ok) {
    return localizedMetadata({
      title: locale === 'en' ? 'Travel eSIM' : 'eSIM du lịch',
      path: `/esim/${slug}`,
      enTitle: 'Travel eSIM',
    });
  }
  const matched = findEsimOfferBySlug(result.offers, slug);
  if (!matched) {
    return localizedMetadata({
      title: locale === 'en' ? 'Travel eSIM' : 'eSIM du lịch',
      path: `/esim/${slug}`,
      enTitle: 'Travel eSIM',
      robots: 'noindex,follow',
    });
  }
  const { offer } = matched;
  const path = esimOfferPath(offer);
  return localizedMetadata({
    title: esimOfferSeoTitle(offer, 'vi'),
    description: esimOfferSeoDescription(offer, 'vi'),
    enTitle: esimOfferSeoTitle(offer, 'en'),
    enDescription: esimOfferSeoDescription(offer, 'en'),
    path,
    ogImage: offer.countryImageUrl || offer.photo || undefined,
  });
}

async function EsimDetailLoader({ slug }: { slug: string }) {
  const locale = await readRequestLocale();
  const result = await listEsimPreviewOffers(locale);
  if (!result.ok) {
    return <EsimLoadError message={result.error} />;
  }
  const matched = findEsimOfferBySlug(result.offers, slug);
  if (!matched) {
    notFound();
  }
  if (matched.viaLegacy) {
    permanentRedirect(esimOfferPath(matched.offer));
  }
  const { offer } = matched;
  const plansHref = countryPlansHref(offer.countryIso);
  return (
    <>
      <EsimOfferJsonLd offer={offer} locale={locale} />
      <EsimDetailClient
        offer={offer}
        offers={result.offers}
        plansHref={plansHref || esimOfferCountryPath(offer)}
        salesOpen={result.salesOpen}
      />
    </>
  );
}

export default async function EsimDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <div className="site-container py-6 md:py-8">
      <Suspense fallback={<EsimDetailSkeleton />}>
        <EsimDetailLoader slug={slug} />
      </Suspense>
    </div>
  );
}
