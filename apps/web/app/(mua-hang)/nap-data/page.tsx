import type { Metadata } from 'next';
import { DataPageClient } from '@/components/topup/DataPageClient';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Nạp data 3G/4G/5G — CardOn.vn',
  description:
    'Mua gói data Viettel, Mobifone, Vinaphone tự động 24/7. Thanh toán an toàn trên CardOn.',
  path: '/nap-data',
});

export default function NapDataPage() {
  return <DataPageClient />;
}
