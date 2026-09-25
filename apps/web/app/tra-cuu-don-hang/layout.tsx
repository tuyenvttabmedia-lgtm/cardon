import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Tra cứu đơn hàng — CardOn.vn',
  path: '/tra-cuu-don-hang',
  robots: { index: false, follow: false },
});

export default function TraCuuDonHangLayout({ children }: { children: React.ReactNode }) {
  return children;
}
