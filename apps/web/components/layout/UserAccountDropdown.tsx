'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ACCOUNT_PATHS } from '@/lib/account-routes';
import { useAuth } from '@/hooks/useAuth';
import { isDataServiceVisible, useSiteConfig } from '@/hooks/useSiteConfig';

const MENU = [
  { href: ACCOUNT_PATHS.profile, label: 'Thông tin tài khoản' },
  { href: ACCOUNT_PATHS.orders, label: 'Lịch sử giao dịch' },
  { href: ACCOUNT_PATHS.cards, label: 'Mã thẻ đã mua' },
  { href: ACCOUNT_PATHS.topups, label: 'Nạp cước' },
  { href: ACCOUNT_PATHS.data, label: 'Nạp Data', requiresData: true },
  { href: ACCOUNT_PATHS.password, label: 'Bảo mật' },
];

export function UserAccountDropdown() {
  const { user, logout } = useAuth();
  const siteConfig = useSiteConfig();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  if (!user) return null;

  const displayName = user.fullName || user.username || user.email;
  const initial = displayName.charAt(0).toUpperCase();
  const menuItems = MENU.filter(
    (item) => !('requiresData' in item && item.requiresData) || isDataServiceVisible(siteConfig),
  );

  return (
    <div className="relative hidden sm:block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-gray-200 px-2 py-1.5 text-sm font-medium text-cardon-navy hover:bg-gray-50"
        aria-expanded={open}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cardon-blue text-sm font-bold text-white">
          {initial}
        </span>
        <span className="max-w-[120px] truncate">{displayName}</span>
        <span className="text-xs text-cardon-gray">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
          <p className="border-b px-4 py-2 text-xs text-cardon-gray">{user.email}</p>
          {menuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-4 py-2.5 text-sm text-cardon-navy hover:bg-cardon-light"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            className="block w-full border-t px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
            onClick={() => {
              setOpen(false);
              logout();
            }}
          >
            Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}
