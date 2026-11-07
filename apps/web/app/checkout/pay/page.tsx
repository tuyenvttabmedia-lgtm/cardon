import type { Metadata } from 'next';
import { Suspense } from 'react';
import { localizedMetadata } from '@/lib/seo';
import CheckoutPayPageClient from './CheckoutPayClient';

export function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({
    title: 'Quét QR thanh toán — CardOn.vn',
    path: '/checkout/pay',
    robots: { index: false, follow: false },
    enTitle: 'Pay with QR — CardOn.vn',
  });
}

export default function CheckoutPayPage() {
  return (
    <Suspense fallback={<p className="text-gray-500">Đang tải…</p>}>
      <CheckoutPayPageClient />
    </Suspense>
  );
}
