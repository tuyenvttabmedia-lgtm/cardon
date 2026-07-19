import type { Metadata } from 'next';
import { AccountLayoutClient } from '../account/AccountLayoutClient';
import { buildMetadata } from '@/lib/seo';
import { ACCOUNT_BASE } from '@/lib/account-routes';

export const metadata: Metadata = buildMetadata({
  title: 'Trung tâm tài khoản — CardOn.vn',
  description: 'Quản lý thông tin tài khoản, lịch sử giao dịch, thẻ đã mua và bảo mật tại CardOn.vn',
  path: ACCOUNT_BASE,
  robots: 'noindex,nofollow',
});

export default function TaiKhoanLayout({ children }: { children: React.ReactNode }) {
  return <AccountLayoutClient>{children}</AccountLayoutClient>;
}
