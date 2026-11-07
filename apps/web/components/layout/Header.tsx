'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useThemeSettings } from '@/hooks/useThemeSettings';
import { filterHeaderMenuBySiteConfig, useSiteConfig } from '@/hooks/useSiteConfig';
import { UserAccountDropdown } from './UserAccountDropdown';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { MobileMenu } from './MobileMenu';
import { isOptimizableImageSrc, optimizerImageSrc } from '@/lib/assets';
import { cn } from '@/lib/utils';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { useBarePath, useLocale, useT } from '@/components/i18n/LocaleProvider';
import { resolveMenuLabel } from '@/lib/i18n/theme-labels';

function isActivePath(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Header() {
  const pathname = useBarePath();
  const { locale } = useLocale();
  const { isAuthenticated, logout } = useAuth();
  const siteConfig = useSiteConfig();
  const { headerMenu, logoDesktop, theme } = useThemeSettings();
  const visibleMenu = filterHeaderMenuBySiteConfig(headerMenu, siteConfig);
  const [menuOpen, setMenuOpen] = useState(false);
  const t = useT();
  const logoKey = `${logoDesktop}|${theme?.favicon ?? ''}`;
  const logoSrc = optimizerImageSrc(logoDesktop) ?? logoDesktop;

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-cardon-border bg-white/95 shadow-sm backdrop-blur">
        <div className="site-container relative flex h-14 items-center justify-between gap-3">
          <Link href="/" className="relative z-10 flex h-9 shrink-0 items-center md:h-10">
            <Image
              key={`logo-${logoKey}`}
              src={logoSrc}
              alt="CardOn.vn"
              width={180}
              height={48}
              quality={60}
              sizes="140px"
              className="h-full w-auto object-contain"
              style={{ width: 'auto' }}
              priority
              unoptimized={!isOptimizableImageSrc(logoSrc)}
            />
          </Link>

          <nav className="absolute left-1/2 z-10 hidden -translate-x-1/2 items-center gap-1 lg:flex">
            {visibleMenu.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <Link
                  key={`${item.href}-${item.label}`}
                  href={item.href}
                  className={cn(
                    'relative rounded-lg px-3 py-1.5 text-[15px] font-semibold uppercase tracking-wide transition',
                    active
                      ? 'text-cardon-blue after:absolute after:bottom-0 after:left-3 after:right-3 after:h-0.5 after:rounded-full after:bg-cardon-blue'
                      : 'text-cardon-navy hover:bg-cardon-light hover:text-cardon-blue',
                  )}
                >
                  {resolveMenuLabel(locale, item)}
                </Link>
              );
            })}
          </nav>

          <div className="relative z-10 flex shrink-0 items-center gap-2">
            <Link
              href="/#home-search"
              aria-label={t('nav.search')}
              className="hidden h-10 w-10 items-center justify-center rounded-full text-cardon-navy hover:bg-cardon-light lg:inline-flex"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
                <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
                <path d="M16 16.5 20 20.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </Link>
            <LanguageSwitcher compact />
            {isAuthenticated ? (
              <>
                <NotificationBell className="hidden lg:block" />
                <UserAccountDropdown />
              </>
            ) : (
              <>
            <Link
              href="/login"
              className="hidden rounded-lg px-3 py-2 text-[15px] font-semibold text-cardon-navy hover:text-cardon-blue sm:inline"
            >
              {t('nav.login')}
            </Link>
                <Link
                  href="/register"
                  className="hidden rounded-lg bg-cardon-blue px-4 py-2 text-[15px] font-semibold text-white hover:bg-cardon-navy sm:inline"
                >
                  {t('nav.register')}
                </Link>
              </>
            )}
            <div className="flex items-center gap-2 lg:hidden">
              {isAuthenticated ? (
                <NotificationBell />
              ) : (
                <Link
                  href="/login"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cardon-border text-lg"
                  aria-label={t('nav.account')}
                >
                  🔔
                </Link>
              )}
              <button
                type="button"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cardon-border"
                aria-label={menuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <span className="text-xl leading-none">{menuOpen ? '×' : '☰'}</span>
              </button>
            </div>
          </div>
        </div>
      </header>
      <MobileMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={visibleMenu}
        isAuthenticated={isAuthenticated}
        onLogout={logout}
      />
    </>
  );
}
