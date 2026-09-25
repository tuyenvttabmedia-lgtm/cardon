import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Chi tiết đơn hàng — CardOn.vn',
  path: '/orders',
  robots: { index: false, follow: false },
});

export default function OrderByIdLayout({ children }: { children: React.ReactNode }) {
  return children;
}
