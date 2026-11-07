import type { Metadata } from 'next';
import { Suspense } from 'react';
import { localizedMetadata } from '@/lib/seo';
import CheckoutResultClient from './CheckoutResultClient';

export function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({
    title: 'Kết quả thanh toán — CardOn.vn',
    path: '/checkout/result',
    robots: { index: false, follow: false },
    enTitle: 'Payment result — CardOn.vn',
  });
}

export default function CheckoutResultPage() {
  return (
    <Suspense fallback={<p className="text-gray-500">Đang tải kết quả thanh toán…</p>}>
      <CheckoutResultClient />
    </Suspense>
  );
}
