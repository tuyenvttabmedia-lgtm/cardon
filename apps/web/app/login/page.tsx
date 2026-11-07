import type { Metadata } from 'next';
import { localizedMetadata } from '@/lib/seo';
import { translate } from '@/lib/i18n/messages';
import LoginPageClient from './LoginPageClient';

export function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({
    title: 'Đăng nhập — CardOn.vn',
    path: '/login',
    robots: { index: false, follow: false },
    enTitle: translate('en', 'seo.loginTitle'),
  });
}

export default function LoginPage() {
  return <LoginPageClient />;
}
