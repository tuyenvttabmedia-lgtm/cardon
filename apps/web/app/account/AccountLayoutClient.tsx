'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { WrongRetailPortalNotice } from '@/components/auth/WrongRetailPortalNotice';
import { useBarePath, useT } from '@/components/i18n/LocaleProvider';
import { PageContainer } from '@/components/layout/PageContainer';
import type { MessageKey } from '@/lib/i18n/messages';
import { useAuth } from '@/hooks/useAuth';
import { isDataServiceVisible, useSiteConfig } from '@/hooks/useSiteConfig';
import { ACCOUNT_PATHS } from '@/lib/account-routes';
import { isRetailCustomerRole } from '@/lib/retail-auth';
import { cn } from '@/lib/utils';

const LINKS: Array<{ href: string; labelKey: MessageKey; icon: string; requiresData?: boolean }> = [
  { href: ACCOUNT_PATHS.profile, labelKey: 'account.profile', icon: '👤' },
  { href: ACCOUNT_PATHS.orders, labelKey: 'account.orders', icon: '📋' },
  { href: ACCOUNT_PATHS.gameCards, labelKey: 'account.gameCards', icon: '🎮' },
  { href: ACCOUNT_PATHS.phoneCards, labelKey: 'account.phoneCards', icon: '📱' },
  { href: ACCOUNT_PATHS.esim, labelKey: 'account.esim', icon: '📶' },
  { href: ACCOUNT_PATHS.topups, labelKey: 'account.topups', icon: '⚡' },
  { href: ACCOUNT_PATHS.data, labelKey: 'account.data', icon: '📶', requiresData: true },
  { href: ACCOUNT_PATHS.support, labelKey: 'nav.help', icon: '🎧' },
  { href: ACCOUNT_PATHS.password, labelKey: 'account.passwordTitle', icon: '🔒' },
];

export function AccountLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = useBarePath();
  const t = useT();
  const router = useRouter();
  const { user, isAuthenticated, loading, logout } = useAuth();
  const siteConfig = useSiteConfig();
  const links = LINKS.filter(
    (item) => !('requiresData' in item && item.requiresData) || isDataServiceVisible(siteConfig),
  );
  const wrongPortal = Boolean(user && !isRetailCustomerRole(user.role));

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
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-cardon-navy">{t('account.center')}</h1>
        <p className="mt-1 text-sm text-cardon-gray">{t('account.centerBody')}</p>
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
                  {t(l.labelKey)}
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
                {t(l.labelKey)}
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
