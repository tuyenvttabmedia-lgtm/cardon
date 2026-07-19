import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { vi } from '@/lib/i18n/vi';
import { cn } from '@/lib/utils';

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
    <nav className="flex flex-wrap gap-2 border-b border-zinc-200 pb-3">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-medium',
            pathname === tab.href || (tab.href !== '/marketing' && pathname.startsWith(tab.href + '/'))
              ? 'bg-admin-600 text-white'
              : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
