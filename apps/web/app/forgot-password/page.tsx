import type { Metadata } from 'next';
import { localizedMetadata } from '@/lib/seo';
import { translate } from '@/lib/i18n/messages';
import ForgotPasswordPageClient from './ForgotPasswordPageClient';

export function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({
    title: 'Quên mật khẩu — CardOn.vn',
    path: '/forgot-password',
    robots: { index: false, follow: false },
    enTitle: translate('en', 'seo.forgotTitle'),
  });
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordPageClient />;
}
