import type { Metadata } from 'next';
import { AccountLayoutClient } from './AccountLayoutClient';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Trung tâm tài khoản — CardOn.vn',
  description: 'Quản lý thông tin tài khoản, lịch sử giao dịch, thẻ đã mua và bảo mật tại CardOn.vn',
  path: '/account',
  robots: 'noindex,nofollow',
});

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <AccountLayoutClient>{children}</AccountLayoutClient>;
}
