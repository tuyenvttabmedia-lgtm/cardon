'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useThemeSettings } from '@/hooks/useThemeSettings';
import { filterMobileNavBySiteConfig, useSiteConfig } from '@/hooks/useSiteConfig';
import { cn } from '@/lib/utils';

function navItemActive(pathname: string, url: string): boolean {
  const base = url.split('?')[0];
  if (base === '/') return pathname === '/';
  return pathname === base || pathname.startsWith(`${base}/`);
}

function isAccountItem(label: string, requireLogin?: boolean): boolean {
  return requireLogin === true || label.toLowerCase().includes('tài khoản');
}

function MobileNavItem({
  active,
  icon,
  label,
  href,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
}) {
  const className = cn(
    'relative flex h-16 w-full flex-col items-center justify-center gap-0.5 px-1',
  );
  const content = (
    <>
      {active && (
        <span className="absolute top-0 left-1/2 h-[3px] w-6 -translate-x-1/2 rounded-full bg-cardon-blue" />
      )}
      <span
        aria-hidden
        className={cn(
          'flex h-[22px] w-[22px] items-center justify-center text-[22px] leading-none',
          active ? 'text-cardon-blue' : 'text-cardon-gray',
        )}
      >
        {icon}
      </span>
      <span
        className={cn(
          'text-[10px]',
          active ? 'font-semibold text-cardon-blue' : 'font-medium text-cardon-gray',
        )}
      >
        {label}
      </span>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    );
  }

  return (
    <Link href={href ?? '/'} className={className} aria-current={active ? 'page' : undefined}>
      {content}
    </Link>
  );
}

function MobileAccountSheet({
  open,
  onClose,
  isAuthenticated,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  isAuthenticated: boolean;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, onClose]);

  if (!open) return null;

  const loginHref = `/login${pathname !== '/' ? `?redirect=${encodeURIComponent(pathname)}` : ''}`;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[55] bg-black/30 md:hidden"
        aria-label="Đóng"
        onClick={onClose}
      />
      <div
        ref={ref}
        className="fixed bottom-[4.5rem] left-3 right-3 z-[56] overflow-hidden rounded-xl border border-cardon-border bg-white shadow-xl md:hidden"
      >
        {isAuthenticated ? (
          <div className="py-1">
            {[
              { href: '/account', label: 'Thông tin tài khoản' },
              { href: '/account/orders', label: 'Lịch sử giao dịch' },
              { href: '/account/orders', label: 'Đơn hàng' },
            ].map((item) => (
              <Link
                key={item.label}
                href={item.href}
                onClick={onClose}
                className="block px-4 py-3 text-sm font-medium text-cardon-navy hover:bg-cardon-light"
              >
                {item.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={() => {
                onClose();
                onLogout();
              }}
              className="block w-full border-t px-4 py-3 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              Đăng xuất
            </button>
          </div>
        ) : (
          <div className="space-y-2 p-3">
            <Link
              href={loginHref}
              onClick={onClose}
              className="block rounded-lg border border-gray-200 py-2.5 text-center text-sm font-semibold text-cardon-navy"
            >
              Đăng nhập
            </Link>
            <Link
              href="/register"
              onClick={onClose}
              className="block rounded-lg bg-cardon-blue py-2.5 text-center text-sm font-semibold text-white"
            >
              Đăng ký
            </Link>
          </div>
        )}
      </div>
    </>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const { isAuthenticated, logout } = useAuth();
  const { mobileNav } = useThemeSettings();
  const siteConfig = useSiteConfig();
  const [accountOpen, setAccountOpen] = useState(false);

  const visible = filterMobileNavBySiteConfig(
    mobileNav.filter((item) => item.active !== false),
    siteConfig,
  );

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-cardon-border bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <ul className="mx-auto flex h-16 max-w-site items-stretch justify-around px-1">
          {visible.map((item) => {
            const active = navItemActive(pathname, item.url);
            const isAccount = isAccountItem(item.label, item.requireLogin);

            return (
              <li key={`${item.url}-${item.label}`} className="flex min-w-0 flex-1">
                {isAccount ? (
                  <MobileNavItem
                    active={active}
                    icon={item.icon}
                    label={item.label}
                    onClick={() => setAccountOpen(true)}
                  />
                ) : (
                  <MobileNavItem
                    active={active}
                    icon={item.icon}
                    label={item.label}
                    href={item.url}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      <MobileAccountSheet
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        isAuthenticated={isAuthenticated}
        onLogout={logout}
      />
    </>
  );
}
