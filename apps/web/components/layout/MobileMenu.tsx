'use client';

import Link from 'next/link';
import { useBarePath, useLocale, useT } from '@/components/i18n/LocaleProvider';
import { ACCOUNT_PATHS } from '@/lib/account-routes';
import { resolveMenuLabel } from '@/lib/i18n/theme-labels';

interface MenuItem {
  label: string;
  href: string;
  labelEn?: string;
  navKey?: string;
}

export function MobileMenu({
  open,
  onClose,
  items,
  isAuthenticated,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  items: MenuItem[];
  isAuthenticated: boolean;
  onLogout: () => void;
}) {
  const pathname = useBarePath();
  const { locale } = useLocale();
  const t = useT();

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[59] bg-black/40 lg:hidden"
        aria-label={t('nav.closeMenu')}
        onClick={onClose}
      />
      <div className="fixed right-3 top-16 z-[60] w-[min(18rem,calc(100%-1.5rem))] lg:hidden">
        <div className="overflow-hidden rounded-xl border border-cardon-border bg-white shadow-xl">
          <nav className="flex max-h-[50vh] flex-col overflow-y-auto py-1">
            {items.map((item) => (
              <Link
                key={`${item.href}-${item.label}`}
                href={item.href}
                onClick={onClose}
                className="px-4 py-2.5 text-sm font-medium text-cardon-navy hover:bg-cardon-light"
              >
                {resolveMenuLabel(locale, item)}
              </Link>
            ))}
          </nav>
          <div className="border-t border-cardon-border" />
          <div className="space-y-1.5 p-2.5">
            {isAuthenticated ? (
              <>
                {/* Single account entry — section nav lives inside Trung tâm tài khoản. */}
                <Link
                  href={ACCOUNT_PATHS.profile}
                  onClick={onClose}
                  className="block rounded-lg px-3 py-2 text-center text-sm font-semibold text-cardon-navy hover:bg-cardon-light"
                >
                  {t('account.center')}
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onLogout();
                  }}
                  className="block w-full rounded-lg border border-red-200 py-2 text-center text-sm font-semibold text-red-600 hover:bg-red-50"
                >
                  {t('nav.logout')}
                </button>
              </>
            ) : (
              <>
                <Link
                  href={`/login${pathname !== '/' ? `?redirect=${encodeURIComponent(pathname)}` : ''}`}
                  onClick={onClose}
                  className="block rounded-lg border border-gray-200 py-2 text-center text-sm font-semibold text-cardon-navy"
                >
                  {t('nav.login')}
                </Link>
                <Link
                  href="/register"
                  onClick={onClose}
                  className="block rounded-lg bg-cardon-blue py-2 text-center text-sm font-semibold text-white"
                >
                  {t('nav.register')}
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
