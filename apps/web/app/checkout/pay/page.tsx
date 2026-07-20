import type { Metadata } from 'next';
import { Suspense } from 'react';
import { buildMetadata } from '@/lib/seo';
import CheckoutPayPageClient from './CheckoutPayClient';

export const metadata: Metadata = buildMetadata({
  title: 'Quét QR thanh toán — CardOn.vn',
  path: '/checkout/pay',
  robots: { index: false, follow: false },
});

export default function CheckoutPayPage() {
  return (
    <Suspense fallback={<p className="text-gray-500">Đang tải…</p>}>
      <CheckoutPayPageClient />
    </Suspense>
  );
}
