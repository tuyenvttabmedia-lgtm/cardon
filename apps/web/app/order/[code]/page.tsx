import type { Metadata } from 'next';
import { Suspense } from 'react';
import { buildMetadata } from '@/lib/seo';
import OrderDetailPageClient from './OrderDetailClient';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  return buildMetadata({
    title: `Đơn hàng ${code} — CardOn.vn`,
    path: `/order/${code}`,
  });
}

export default async function OrderPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return (
    <Suspense fallback={<p className="text-gray-500">Đang tải...</p>}>
      <OrderDetailPageClient orderCode={code} />
    </Suspense>
  );
}
