import { notFound } from 'next/navigation';
import { FaqDetailPageClient } from '@/components/faq/FaqDetailPageClient';
import { getFaqDetail } from '@/lib/cms-api';
import { buildMetadata } from '@/lib/seo';
import { plainTextFromFaqHtml } from '@/lib/sanitize-faq-html';

type Props = {
  params: Promise<{ categorySlug: string; slug: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { categorySlug, slug } = await params;
  const data = await getFaqDetail(categorySlug, slug);
  if (!data?.faq) return buildMetadata({ title: 'Trợ giúp — CardOn.vn', path: '/tro-giup' });

  const description = plainTextFromFaqHtml(data.faq.answer).slice(0, 160);
  return buildMetadata({
    title: `${data.faq.question} — Trợ giúp CardOn.vn`,
    description,
    path: `/tro-giup/${categorySlug}/${slug}`,
  });
}

export default async function FaqDetailPage({ params }: Props) {
  const { categorySlug, slug } = await params;
  const data = await getFaqDetail(categorySlug, slug);
  if (!data?.faq) notFound();

  return <FaqDetailPageClient data={data} />;
}
