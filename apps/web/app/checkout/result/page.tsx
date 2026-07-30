import type { Metadata } from 'next';
import { Suspense } from 'react';
import { buildMetadata } from '@/lib/seo';
import CheckoutResultClient from './CheckoutResultClient';

export const metadata: Metadata = buildMetadata({
  title: 'Kết quả thanh toán — CardOn.vn',
  path: '/checkout/result',
  robots: { index: false, follow: false },
});

export default function CheckoutResultPage() {
  return (
    <Suspense fallback={<p className="text-gray-500">Đang tải kết quả thanh toán…</p>}>
      <CheckoutResultClient />
    </Suspense>
  );
}
