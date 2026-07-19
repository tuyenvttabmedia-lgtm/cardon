'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn, ROLE_LABELS } from '@/lib/utils';
import { NAV_ITEMS, canAccessNavItem } from '@/lib/permissions';
import { BuildInfoService } from '@/lib/build-version';
import { vi } from '@/lib/i18n/vi';
import { GlobalSearchBar } from '@/components/layout/GlobalSearchBar';
import { AdminNotificationBell } from '@/components/layout/AdminNotificationBell';
import { useAuth } from '@/hooks/useAuth';

function SidebarNav() {
  const pathname = usePathname();
  const { permissions, user } = useAuth();

  return (
    <nav className="flex-1 space-y-1 p-3">
      {NAV_ITEMS.filter((item) =>
        canAccessNavItem(item, permissions, user?.role ?? ''),
      ).map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'block rounded-lg px-3 py-2 text-sm font-medium transition',
              active
                ? 'bg-admin-50 text-admin-700'
                : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
      >
        <span className="hidden sm:inline">{user?.email}</span>
        <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium">
          {ROLE_LABELS[user?.role ?? ''] ?? user?.role}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-48 rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
          <Link
            href="/account"
            className="block px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            onClick={() => setOpen(false)}
          >
            {vi.account.title}
          </Link>
          <button
            type="button"
            className="block w-full px-4 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
            onClick={() => void logout()}
          >
            Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { permissions, user } = useAuth();

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="hidden w-64 shrink-0 border-r border-zinc-200 bg-white lg:flex lg:flex-col">
        <div className="border-b border-zinc-100 px-5 py-5">
          <Link href="/dashboard" className="text-lg font-bold text-admin-700">
            CardOn <span className="text-admin-500">Quản trị</span>
          </Link>
        </div>
        <SidebarNav />
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur lg:px-6">
          <div className="lg:hidden">
            <Link href="/dashboard" className="font-bold text-admin-700">
              CardOn Admin
            </Link>
          </div>
          <div className="overflow-x-auto lg:hidden">
            <div className="flex gap-1">
              {NAV_ITEMS.filter((item) =>
                canAccessNavItem(item, permissions, user?.role ?? ''),
              ).map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="whitespace-nowrap rounded-lg px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <GlobalSearchBar />
          <AdminNotificationBell />
          <UserMenu />
        </header>
        <main className="flex-1 p-4 lg:p-6">{children}</main>
        <footer className="border-t border-zinc-100 px-4 py-3 text-center text-xs text-zinc-400 lg:px-6">
          <p className="font-medium text-zinc-500">CardOn Admin</p>
          <p>{BuildInfoService.footerLabel()}</p>
        </footer>
      </div>
    </div>
  );
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (isAuthenticated && pathname === '/login') {
      router.replace('/dashboard');
      return;
    }
    if (!isAuthenticated && pathname !== '/login') {
      router.replace('/login');
    }
  }, [loading, isAuthenticated, pathname, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-zinc-500">
        Đang tải...
      </div>
    );
  }

  if (pathname === '/login') {
    if (isAuthenticated) return null;
    return <>{children}</>;
  }

  if (!isAuthenticated) return null;

  return <AdminLayout>{children}</AdminLayout>;
}

export function RequireRole({
  role,
  children,
}: {
  role: string;
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  if (loading) return <p className="text-zinc-500">{vi.app.loading}</p>;
  if (user?.role !== role) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <p className="font-medium text-amber-900">403 — {vi.app.noPermission}</p>
        <p className="mt-1 text-sm text-amber-800">{vi.settings.superAdminOnly}</p>
      </div>
    );
  }
  return <>{children}</>;
}

export function RequirePermission({
  permission,
  children,
}: {
  permission: string;
  children: React.ReactNode;
}) {
  const { can, loading } = useAuth();
  if (loading) return <p className="text-zinc-500">Đang tải...</p>;
  if (!can(permission)) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <p className="font-medium text-amber-900">403 — {vi.app.noPermission}</p>
        <p className="mt-1 text-sm text-amber-800">Quyền: {permission}</p>
      </div>
    );
  }
  return <>{children}</>;
}
