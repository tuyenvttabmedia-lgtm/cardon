import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import LoginPageClient from './LoginPageClient';

export const metadata: Metadata = buildMetadata({
  title: 'Đăng nhập — CardOn.vn',
  path: '/login',
});

export default function LoginPage() {
  return <LoginPageClient />;
}
