import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import AgentRegisterPageClient from './AgentRegisterPageClient';

export const metadata: Metadata = buildMetadata({
  title: 'Đăng ký đại lý — CardOn.vn',
  description: 'Đăng ký tài khoản đối tác B2B CardOn — API thẻ game, thẻ điện thoại, nạp cước.',
  path: '/dang-ky-dai-ly',
});

export default function AgentRegisterPage() {
  return <AgentRegisterPageClient />;
}
