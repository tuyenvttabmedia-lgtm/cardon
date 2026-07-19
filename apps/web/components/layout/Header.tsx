'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useThemeSettings } from '@/hooks/useThemeSettings';
import { filterHeaderMenuBySiteConfig, useSiteConfig } from '@/hooks/useSiteConfig';
import { UserAccountDropdown } from './UserAccountDropdown';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { MobileMenu } from './MobileMenu';
import { cn } from '@/lib/utils';

function isActivePath(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Header() {
  const pathname = usePathname();
  const { isAuthenticated, logout } = useAuth();
  const siteConfig = useSiteConfig();
  const { headerMenu, logoDesktop, theme } = useThemeSettings();
  const visibleMenu = filterHeaderMenuBySiteConfig(headerMenu, siteConfig);
  const [menuOpen, setMenuOpen] = useState(false);
  const logoKey = `${logoDesktop}|${theme?.favicon ?? ''}`;

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-cardon-border bg-white/95 shadow-sm backdrop-blur">
        <div className="site-container flex h-16 items-center gap-3 lg:grid lg:h-[72px] lg:grid-cols-[1fr_auto_1fr] lg:gap-2">
          <Link href="/" className="flex min-w-0 shrink-0 items-center">
            <Image
              key={`logo-${logoKey}`}
              src={logoDesktop}
              alt="CardOn.vn"
              width={180}
              height={48}
              className={cn(
                'w-auto object-contain',
                'h-9 max-w-[140px] md:h-10 md:max-w-none',
              )}
              priority
              unoptimized
            />
          </Link>

          <nav className="hidden items-center justify-center gap-1 lg:flex">
            {visibleMenu.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <Link
                  key={`${item.href}-${item.label}`}
                  href={item.href}
                  className={cn(
                    'relative rounded-lg px-3 py-2 text-[15px] font-semibold uppercase tracking-wide transition',
                    active
                      ? 'text-cardon-blue after:absolute after:bottom-0 after:left-3 after:right-3 after:h-0.5 after:rounded-full after:bg-cardon-blue'
                      : 'text-cardon-navy hover:bg-cardon-light hover:text-cardon-blue',
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2 lg:justify-end">
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
                  Đăng nhập
                </Link>
                <Link
                  href="/register"
                  className="hidden rounded-lg bg-cardon-blue px-4 py-2 text-[15px] font-semibold text-white hover:bg-cardon-navy sm:inline"
                >
                  Đăng ký
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
                  aria-label="Thông báo"
                >
                  🔔
                </Link>
              )}
              <button
                type="button"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cardon-border"
                aria-label="Mở menu"
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
