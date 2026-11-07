import { Suspense } from 'react';
import { FaqHubPageClient } from '@/components/faq/FaqHubPageClient';
import { FaqSchema } from '@/components/seo/FaqSchema';
import { listFaqs } from '@/lib/cms-api';
import type { Metadata } from 'next';
import { localizedMetadata } from '@/lib/seo';
import { translate } from '@/lib/i18n/messages';

export function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({
    title: 'Trung tâm trợ giúp',
    description:
      'Giải đáp thắc mắc về mua thẻ game, thẻ điện thoại, nạp cước, data 4G/5G và thanh toán tại CardOn.vn',
    path: '/tro-giup',
    enTitle: translate('en', 'seo.helpTitle'),
    enDescription: 'Help with cards, top-up, data and payment on CardOn.vn. Published answers stay in Vietnamese until an English version exists.',
  });
}

export default async function TroGiupPage() {
  const featured = await listFaqs({ featured: true, limit: 12 });
  const schemaItems =
    featured?.items?.map((row) => ({
      question: row.question,
      answerHtml: row.answer,
    })) ?? [];

  return (
    <>
      {schemaItems.length > 0 ? <FaqSchema items={schemaItems} /> : null}
      <Suspense fallback={<div className="page-shell py-8 text-sm text-cardon-gray">Đang tải...</div>}>
        <FaqHubPageClient />
      </Suspense>
    </>
  );
}
