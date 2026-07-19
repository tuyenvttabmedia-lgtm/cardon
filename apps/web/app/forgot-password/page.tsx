import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import ForgotPasswordPageClient from './ForgotPasswordPageClient';

export const metadata: Metadata = buildMetadata({
  title: 'Quên mật khẩu — CardOn.vn',
  path: '/forgot-password',
});

export default function ForgotPasswordPage() {
  return <ForgotPasswordPageClient />;
}
