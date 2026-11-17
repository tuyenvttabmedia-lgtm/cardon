'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { WrongRetailPortalNotice } from '@/components/auth/WrongRetailPortalNotice';
import { useBarePath, useT } from '@/components/i18n/LocaleProvider';
import { PageContainer } from '@/components/layout/PageContainer';
import { useAuth } from '@/hooks/useAuth';
import { isDataServiceVisible, useSiteConfig } from '@/hooks/useSiteConfig';
import { ACCOUNT_NAV_LINKS, isAccountNavActive } from '@/lib/account-nav';
import { ACCOUNT_PATHS, isAccountPath } from '@/lib/account-routes';
import { isRetailCustomerRole } from '@/lib/retail-auth';
import { cn } from '@/lib/utils';

export function AccountLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = useBarePath();
  const t = useT();
  const router = useRouter();
  const { user, isAuthenticated, loading, logout } = useAuth();
  const siteConfig = useSiteConfig();
  const links = ACCOUNT_NAV_LINKS.filter(
    (item) => !item.requiresData || isDataServiceVisible(siteConfig),
  );
  const wrongPortal = Boolean(user && !isRetailCustomerRole(user.role));
  const activeHref =
    links.find((l) => isAccountNavActive(pathname, l.href))?.href ?? ACCOUNT_PATHS.profile;
  const activeLabel = links.find((l) => l.href === activeHref);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push(`/login?redirect=${ACCOUNT_PATHS.profile}`);
    }
  }, [loading, isAuthenticated, router]);

  if (loading) {
    return (
      <PageContainer>
        <p className="py-12 text-center text-cardon-gray">{t('common.loading')}</p>
      </PageContainer>
    );
  }

  if (wrongPortal) {
    return (
      <PageContainer>
        <WrongRetailPortalNotice role={user?.role} onLogout={logout} />
      </PageContainer>
    );
  }

  if (!isAuthenticated) {
    return (
      <PageContainer>
        <p className="py-12 text-center text-cardon-gray">{t('common.loading')}</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-8">
      <div className="mb-3 md:mb-6">
        <h1 className="text-2xl font-bold text-cardon-navy">{t('account.center')}</h1>
        <p className="mt-1 text-sm text-cardon-gray">{t('account.centerBody')}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_1fr] lg:gap-6">
        <nav className="hidden lg:block">
          <ul className="space-y-1 rounded-2xl border border-cardon-border bg-white p-3 shadow-card">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className={cn(
                    'flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                    isAccountNavActive(pathname, l.href)
                      ? 'bg-cardon-blue text-white'
                      : 'text-cardon-navy hover:bg-cardon-light',
                  )}
                >
                  <span aria-hidden>{l.icon}</span>
                  {t(l.labelKey)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Sticky, high-contrast switcher so section changes are obvious on mobile. */}
        <div className="sticky top-14 z-20 -mx-1 px-1 lg:hidden">
          <label className="block">
            <span className="mb-1 flex items-center justify-between gap-2 text-xs font-bold text-cardon-blue">
              <span>📂 Chọn mục tài khoản</span>
              <span className="rounded-full bg-cardon-blue/10 px-2 py-0.5 text-[10px] font-semibold">
                {links.length} mục
              </span>
            </span>
            <div className="relative">
              <select
                value={activeHref}
                onChange={(e) => router.push(e.target.value)}
                aria-label="Chọn mục tài khoản"
                className="w-full appearance-none rounded-xl border-2 border-cardon-blue bg-white py-3 pl-3 pr-10 text-sm font-bold text-cardon-navy shadow-md outline-none ring-cardon-blue/20 focus:ring-4"
              >
                {links.map((l) => (
                  <option key={l.href} value={l.href}>
                    {l.icon} {t(l.labelKey)}
                  </option>
                ))}
              </select>
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-base font-bold text-cardon-blue"
              >
                ▾
              </span>
            </div>
            {activeLabel ? (
              <p className="mt-1 text-[11px] text-cardon-gray">
                Đang xem: {activeLabel.icon} {t(activeLabel.labelKey)}
              </p>
            ) : null}
          </label>
        </div>

        <div
          className={cn(
            'min-w-0 rounded-2xl border border-cardon-border bg-white p-4 shadow-card md:p-6',
            isAccountPath(pathname) && 'overflow-x-hidden',
          )}
        >
          {children}
        </div>
      </div>
    </PageContainer>
  );
}
