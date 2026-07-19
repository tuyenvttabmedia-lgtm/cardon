import type { Metadata } from 'next';
import { TopupPageClient } from '@/components/topup/TopupPageClient';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Nạp cước điện thoại — CardOn.vn',
  description:
    'Nạp cước Viettel, Mobifone, Vinaphone, Vietnamobile tự động 24/7. Chiết khấu tốt, thanh toán an toàn.',
  path: '/nap-cuoc',
});

export default function NapCuocPage() {
  return <TopupPageClient />;
}
