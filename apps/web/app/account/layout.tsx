import type { Metadata } from 'next';
import { AccountLayoutClient } from './AccountLayoutClient';
import { localizedMetadata } from '@/lib/seo';

export function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({
    title: 'Trung tâm tài khoản — CardOn.vn',
    description: 'Quản lý thông tin tài khoản, lịch sử giao dịch, thẻ đã mua và bảo mật tại CardOn.vn',
    path: '/account',
    robots: 'noindex,nofollow',
    enTitle: 'Account — CardOn.vn',
    enDescription: 'Account details, orders and security on CardOn.vn',
  });
}

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <AccountLayoutClient>{children}</AccountLayoutClient>;
}
