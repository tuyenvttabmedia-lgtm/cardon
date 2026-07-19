import { Suspense } from 'react';
import { FaqHubPageClient } from '@/components/faq/FaqHubPageClient';
import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Trung tâm trợ giúp — CardOn.vn',
  description:
    'Giải đáp thắc mắc về mua thẻ game, thẻ điện thoại, nạp cước, data 4G/5G và thanh toán tại CardOn.vn',
  path: '/tro-giup',
});

export default function TroGiupPage() {
  return (
    <Suspense fallback={<div className="page-shell py-8 text-sm text-cardon-gray">Đang tải...</div>}>
      <FaqHubPageClient />
    </Suspense>
  );
}
