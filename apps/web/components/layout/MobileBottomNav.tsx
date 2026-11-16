'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useThemeSettings } from '@/hooks/useThemeSettings';
import { filterMobileNavBySiteConfig, useSiteConfig } from '@/hooks/useSiteConfig';
import { useBarePath, useLocale, useT } from '@/components/i18n/LocaleProvider';
import { ACCOUNT_PATHS, isAccountPath } from '@/lib/account-routes';
import { resolveMenuLabel } from '@/lib/i18n/theme-labels';
import { compactMobileNavLabel } from '@/lib/mobile-nav-label';
import { cn } from '@/lib/utils';

function navItemActive(pathname: string, url: string): boolean {
  const base = url.split('?')[0];
  if (base === '/') return pathname === '/';
  if (base === '/account' || base === '/tai-khoan') return isAccountPath(pathname);
  return pathname === base || pathname.startsWith(`${base}/`);
}

function isAccountItem(url: string, requireLogin?: boolean): boolean {
  const path = url.split('?')[0];
  return requireLogin === true || path === '/account' || path === '/tai-khoan';
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
    'relative flex h-16 w-full min-w-0 flex-col items-center justify-center gap-1 px-0.5 transition-colors',
    'active:bg-cardon-light/60',
  );
  const content = (
    <>
      {active ? (
        <span className="absolute top-0 left-1/2 h-[3px] w-7 -translate-x-1/2 rounded-full bg-cardon-blue" />
      ) : null}
      <span
        aria-hidden
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[22px] leading-none transition',
          active
            ? 'bg-cardon-blue/10 text-cardon-blue shadow-sm shadow-cardon-blue/10'
            : 'text-slate-500 grayscale-[0.35]',
        )}
      >
        {icon}
      </span>
      <span
        className={cn(
          'w-full max-w-full px-0.5 text-center text-[10px] leading-tight break-words [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden tracking-tight',
          active ? 'font-bold text-cardon-blue' : 'font-medium text-slate-500',
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

/** Logged-in sheet: logout only — account sections live in Trung tâm tài khoản. */
function MobileAccountSheet({
  open,
  onClose,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  onLogout: () => void;
}) {
  const t = useT();
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
        className="fixed bottom-[4.75rem] left-3 right-3 z-[56] overflow-hidden rounded-2xl border border-cardon-border bg-white shadow-xl md:hidden"
      >
        <div className="py-1">
          <button
            type="button"
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="block w-full px-4 py-3.5 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
          >
            {t('nav.logout')}
          </button>
        </div>
      </div>
    </>
  );
}

function MobileGuestSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = useBarePath();
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const loginHref = `/login${pathname !== '/' ? `?redirect=${encodeURIComponent(pathname)}` : ''}`;

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, onClose]);

  if (!open) return null;

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
        className="fixed bottom-[4.75rem] left-3 right-3 z-[56] space-y-2 overflow-hidden rounded-2xl border border-cardon-border bg-white p-3 shadow-xl md:hidden"
      >
        <Link
          href={loginHref}
          onClick={onClose}
          className="block rounded-lg border border-gray-200 py-2.5 text-center text-sm font-semibold text-cardon-navy"
        >
          {t('nav.login')}
        </Link>
        <Link
          href="/register"
          onClick={onClose}
          className="block rounded-lg bg-cardon-blue py-2.5 text-center text-sm font-semibold text-white"
        >
          {t('nav.register')}
        </Link>
      </div>
    </>
  );
}

export function MobileBottomNav() {
  const pathname = useBarePath();
  const router = useRouter();
  const { locale } = useLocale();
  const { isAuthenticated, logout } = useAuth();
  const { mobileNav } = useThemeSettings();
  const siteConfig = useSiteConfig();
  const [accountOpen, setAccountOpen] = useState(false);

  const visible = filterMobileNavBySiteConfig(
    mobileNav.filter((item) => item.active !== false),
    siteConfig,
  );

  function onAccountTap() {
    if (!isAuthenticated) {
      setAccountOpen(true);
      return;
    }
    // Already in account center → short sheet (center / history / logout). Else go straight in.
    if (isAccountPath(pathname)) {
      setAccountOpen(true);
      return;
    }
    router.push(ACCOUNT_PATHS.profile);
  }

  return (
    <>
      <nav
        className={cn(
          'fixed bottom-0 left-0 right-0 z-50 md:hidden',
          'border-t border-slate-200/90 bg-white',
          'pb-[env(safe-area-inset-bottom)]',
          'shadow-[0_-10px_28px_rgba(15,23,42,0.08)]',
        )}
      >
        <ul className="mx-auto flex h-16 max-w-site items-stretch justify-between gap-0 px-1">
          {visible.map((item) => {
            const active = navItemActive(pathname, item.url);
            const isAccount = isAccountItem(item.url, item.requireLogin);
            const label = compactMobileNavLabel(resolveMenuLabel(locale, item));

            return (
              <li key={`${item.url}-${item.label}`} className="flex min-w-0 flex-1 basis-0">
                {isAccount ? (
                  <MobileNavItem
                    active={active}
                    icon={item.icon}
                    label={label}
                    onClick={onAccountTap}
                  />
                ) : (
                  <MobileNavItem
                    active={active}
                    icon={item.icon}
                    label={label}
                    href={item.url}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      {isAuthenticated ? (
        <MobileAccountSheet
          open={accountOpen}
          onClose={() => setAccountOpen(false)}
          onLogout={logout}
        />
      ) : (
        <MobileGuestSheet open={accountOpen} onClose={() => setAccountOpen(false)} />
      )}
    </>
  );
}
