import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import RegisterPageClient from './RegisterPageClient';

export const metadata: Metadata = buildMetadata({
  title: 'Đăng ký — CardOn.vn',
  path: '/register',
  robots: { index: false, follow: false },
});

export default function RegisterPage() {
  return <RegisterPageClient />;
}
