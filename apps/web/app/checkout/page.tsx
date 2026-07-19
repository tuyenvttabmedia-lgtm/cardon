import type { Metadata } from 'next';
import { Suspense } from 'react';
import { buildMetadata } from '@/lib/seo';
import CheckoutPageClient from './CheckoutPageClient';

export const metadata: Metadata = buildMetadata({
  title: 'Thanh toán — CardOn.vn',
  path: '/checkout',
});

export default function CheckoutPage() {
  return (
    <Suspense fallback={<p className="text-gray-500">Đang tải...</p>}>
      <CheckoutPageClient />
    </Suspense>
  );
}
