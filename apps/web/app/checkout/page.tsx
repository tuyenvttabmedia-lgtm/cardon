import type { Metadata } from 'next';
import { Suspense } from 'react';
import { localizedMetadata } from '@/lib/seo';
import { translate } from '@/lib/i18n/messages';
import CheckoutPageClient from './CheckoutPageClient';

export function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({
    title: 'Thanh toán — CardOn.vn',
    path: '/checkout',
    robots: { index: false, follow: false },
    enTitle: translate('en', 'seo.checkoutTitle'),
  });
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<p className="text-gray-500">Đang tải...</p>}>
      <CheckoutPageClient />
    </Suspense>
  );
}
