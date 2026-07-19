'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { PageContainer } from '@/components/layout/PageContainer';
import { useAuth } from '@/hooks/useAuth';
import { isDataServiceVisible, useSiteConfig } from '@/hooks/useSiteConfig';
import { ACCOUNT_PATHS } from '@/lib/account-routes';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: ACCOUNT_PATHS.profile, label: 'Thông tin tài khoản', icon: '👤' },
  { href: ACCOUNT_PATHS.orders, label: 'Lịch sử giao dịch', icon: '📋' },
  { href: ACCOUNT_PATHS.cards, label: 'Thẻ đã mua', icon: '💳' },
  { href: ACCOUNT_PATHS.topups, label: 'Nạp cước', icon: '⚡' },
  { href: ACCOUNT_PATHS.data, label: 'Nạp Data', icon: '📶', requiresData: true },
  { href: ACCOUNT_PATHS.support, label: 'Hỗ trợ', icon: '🎧' },
  { href: ACCOUNT_PATHS.password, label: 'Đổi mật khẩu', icon: '🔒' },
];

export function AccountLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();
  const siteConfig = useSiteConfig();
  const links = LINKS.filter(
    (item) => !('requiresData' in item && item.requiresData) || isDataServiceVisible(siteConfig),
  );

  useEffect(() => {
    if (!loading && !isAuthenticated) router.push(`/login?redirect=${ACCOUNT_PATHS.profile}`);
  }, [loading, isAuthenticated, router]);

  if (loading || !isAuthenticated) {
    return (
      <PageContainer>
        <p className="py-12 text-center text-cardon-gray">Đang tải...</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-cardon-navy">Trung tâm tài khoản</h1>
        <p className="mt-1 text-sm text-cardon-gray">Quản lý thông tin, đơn hàng và bảo mật</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <nav className="hidden lg:block">
          <ul className="space-y-1 rounded-2xl border border-cardon-border bg-white p-3 shadow-card">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className={cn(
                    'flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                    pathname === l.href || (l.href !== ACCOUNT_PATHS.profile && pathname.startsWith(`${l.href}/`))
                      ? 'bg-cardon-blue text-white'
                      : 'text-cardon-navy hover:bg-cardon-light',
                  )}
                >
                  <span aria-hidden>{l.icon}</span>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="lg:hidden">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition',
                  pathname === l.href || (l.href !== ACCOUNT_PATHS.profile && pathname.startsWith(`${l.href}/`))
                    ? 'bg-cardon-blue text-white'
                    : 'border border-cardon-border bg-white text-cardon-navy',
                )}
              >
                <span aria-hidden>{l.icon}</span>
                {l.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="min-w-0 rounded-2xl border border-cardon-border bg-white p-4 shadow-card md:p-6">
          {children}
        </div>
      </div>
    </PageContainer>
  );
}
