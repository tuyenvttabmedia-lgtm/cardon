import type { Metadata } from 'next';
import { localizedMetadata } from '@/lib/seo';
import { translate } from '@/lib/i18n/messages';
import ResetPasswordPageClient from './ResetPasswordPageClient';

export function generateMetadata(): Promise<Metadata> {
  return localizedMetadata({
    title: 'Đặt lại mật khẩu — CardOn.vn',
    path: '/reset-password',
    robots: { index: false, follow: false },
    enTitle: translate('en', 'seo.resetTitle'),
  });
}

export default function ResetPasswordPage() {
  return <ResetPasswordPageClient />;
}
