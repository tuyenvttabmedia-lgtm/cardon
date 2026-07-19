import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import ResetPasswordPageClient from './ResetPasswordPageClient';

export const metadata: Metadata = buildMetadata({
  title: 'Đặt lại mật khẩu — CardOn.vn',
  path: '/reset-password',
});

export default function ResetPasswordPage() {
  return <ResetPasswordPageClient />;
}
