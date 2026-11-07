import type { Metadata } from 'next';
import { Suspense } from 'react';
import { localizedMetadata } from '@/lib/seo';
import CheckoutSuccessPageClient from './CheckoutSuccessClient';

export function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({
    title: 'Thanh toán thành công — CardOn.vn',
    path: '/checkout/success',
    robots: { index: false, follow: false },
    enTitle: 'Payment received — CardOn.vn',
  });
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<p className="text-gray-500">Đang tải...</p>}>
      <CheckoutSuccessPageClient />
    </Suspense>
  );
}
