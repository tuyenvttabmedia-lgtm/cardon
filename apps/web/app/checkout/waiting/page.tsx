import type { Metadata } from 'next';
import { Suspense } from 'react';
import { localizedMetadata } from '@/lib/seo';
import CheckoutWaitingClient from './CheckoutWaitingClient';

export function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({
    title: 'Đang chờ thanh toán — CardOn.vn',
    path: '/checkout/waiting',
    robots: { index: false, follow: false },
    enTitle: 'Waiting for payment — CardOn.vn',
  });
}

export default function CheckoutWaitingPage() {
  return (
    <Suspense fallback={<p className="page-shell text-cardon-gray">Đang tải…</p>}>
      <CheckoutWaitingClient />
    </Suspense>
  );
}
