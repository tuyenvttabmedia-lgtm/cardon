import type { Metadata } from 'next';
import { Suspense } from 'react';
import { buildMetadata } from '@/lib/seo';
import CheckoutSuccessPageClient from './CheckoutSuccessClient';

export const metadata: Metadata = buildMetadata({
  title: 'Thanh toán thành công — CardOn.vn',
  path: '/checkout/success',
});

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<p className="text-gray-500">Đang tải...</p>}>
      <CheckoutSuccessPageClient />
    </Suspense>
  );
}
