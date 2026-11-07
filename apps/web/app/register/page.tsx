import type { Metadata } from 'next';
import { localizedMetadata } from '@/lib/seo';
import { translate } from '@/lib/i18n/messages';
import RegisterPageClient from './RegisterPageClient';

export function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({
    title: 'Đăng ký — CardOn.vn',
    path: '/register',
    robots: { index: false, follow: false },
    enTitle: translate('en', 'seo.registerTitle'),
  });
}

export default function RegisterPage() {
  return <RegisterPageClient />;
}
