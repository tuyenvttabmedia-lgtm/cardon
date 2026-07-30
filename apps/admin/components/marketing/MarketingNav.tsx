'use client';

import { usePathname } from 'next/navigation';
import { SectionNav } from '@/components/ui/Navigation';
import { vi } from '@/lib/i18n/vi';

const TABS = [
  { href: '/marketing', label: 'Dashboard' },
  { href: '/marketing/articles', label: vi.nav.articles },
  { href: '/marketing/pages', label: vi.nav.pages },
  { href: '/marketing/contacts', label: 'Liên hệ' },
  { href: '/marketing/faq', label: 'FAQ' },
  { href: '/marketing/categories', label: 'Danh mục' },
  { href: '/marketing/tags', label: 'Thẻ' },
  { href: '/marketing/media', label: 'Thư viện ảnh' },
  { href: '/marketing/banners', label: vi.nav.banners },
  { href: '/marketing/email-templates', label: 'Email Templates' },
  { href: '/marketing/appearance', label: 'Giao diện' },
  { href: '/marketing/seo', label: vi.nav.seoSettings },
];

export function MarketingNav() {
  const pathname = usePathname();
  return (
    <SectionNav
      ariaLabel="Điều hướng nội dung và marketing"
      items={TABS.map((tab) => ({
        href: tab.href,
        label: tab.label,
        active:
          pathname === tab.href ||
          (tab.href !== '/marketing' && pathname.startsWith(`${tab.href}/`)),
      }))}
    />
  );
}
