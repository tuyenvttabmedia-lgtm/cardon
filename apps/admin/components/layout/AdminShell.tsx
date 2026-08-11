'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn, ROLE_LABELS } from '@/lib/utils';
import { NAV_ITEMS, canAccessNavItem, isAdminStaffRole } from '@/lib/permissions';
import { BuildInfoService } from '@/lib/build-version';
import { Drawer, DialogCloseButton } from '@/components/ui/Dialog';
import { vi } from '@/lib/i18n/vi';
import { GlobalSearchBar } from '@/components/layout/GlobalSearchBar';
import { AdminNotificationBell } from '@/components/layout/AdminNotificationBell';
import { useAuth } from '@/hooks/useAuth';

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { permissions, user } = useAuth();

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Điều hướng chính">
      <p className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        Điều hành hệ thống
      </p>
      {NAV_ITEMS.filter((item) =>
        canAccessNavItem(item, permissions, user?.role ?? ''),
      ).map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            onClick={onNavigate}
            className={cn(
              'block rounded-lg border-l-2 px-3 py-2.5 text-sm font-medium transition-all duration-150',
              active
                ? 'border-admin-400 bg-white/10 text-white shadow-sm'
                : 'border-transparent text-slate-400 hover:border-slate-600 hover:bg-white/[0.06] hover:text-white',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarBrand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link href="/dashboard" className="group block" onClick={onNavigate}>
      <span className="text-lg font-bold tracking-tight text-white">
        CardOn <span className="text-admin-400 transition-colors group-hover:text-admin-300">Admin</span>
      </span>
      <span className="mt-1 block text-xs font-medium text-slate-500">Trung tâm vận hành</span>
    </Link>
  );
}

function MobileNavDrawer() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Mở menu điều hướng"
        aria-expanded={open}
        className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 lg:hidden"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          className="h-5 w-5"
        >
          <path d="M3 5.5h14M3 10h14M3 14.5h14" />
        </svg>
      </button>
      <Drawer
        open={open}
        onClose={close}
        title="Điều hướng chính"
        panelClassName="border-r border-slate-800 bg-slate-950"
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-5">
          <SidebarBrand onNavigate={close} />
          <DialogCloseButton
            onClose={close}
            className="text-slate-400 hover:bg-white/10 hover:text-white"
          />
        </div>
        <SidebarNav onNavigate={close} />
        <div className="border-t border-white/10 px-5 py-4 text-xs text-slate-500">
          Hệ thống quản trị nội bộ
        </div>
      </Drawer>
    </>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:shadow"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-admin-50 text-xs font-bold text-admin-700">
          {(user?.email?.[0] ?? 'A').toUpperCase()}
        </span>
        <span className="hidden sm:inline">{user?.email}</span>
        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
          {ROLE_LABELS[user?.role ?? ''] ?? user?.role}
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-panel-hover"
        >
          <Link
            href="/account"
            className="block px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-admin-50 hover:text-admin-700"
            onClick={() => setOpen(false)}
          >
            {vi.account.title}
          </Link>
          <button
            type="button"
            className="block w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-red-50 hover:text-red-700"
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
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="hidden w-64 shrink-0 border-r border-slate-800 bg-slate-950 shadow-xl lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="border-b border-white/10 px-5 py-5">
          <SidebarBrand />
        </div>
        <SidebarNav />
        <div className="border-t border-white/10 px-5 py-4 text-xs text-slate-500">
          Hệ thống quản trị nội bộ
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-xl lg:px-6">
          <MobileNavDrawer />
          <Link
            href="/dashboard"
            className="whitespace-nowrap font-bold text-admin-700 lg:hidden"
          >
            CardOn Admin
          </Link>
          <div className="hidden min-w-0 flex-1 lg:block">
            <GlobalSearchBar />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <AdminNotificationBell />
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1920px] flex-1 p-4 sm:p-5 lg:p-7">{children}</main>
        <footer className="border-t border-slate-200/70 bg-white/50 px-4 py-4 text-center text-xs text-slate-400 lg:px-6">
          <p className="font-semibold text-slate-500">CardOn Admin</p>
          <p>{BuildInfoService.footerLabel()}</p>
        </footer>
      </div>
    </div>
  );
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const staffOk = isAdminStaffRole(user?.role);

  useEffect(() => {
    if (loading) return;
    if (isAuthenticated && !staffOk) {
      void logout();
      return;
    }
    if (isAuthenticated && pathname === '/login') {
      router.replace('/dashboard');
      return;
    }
    if (!isAuthenticated && pathname !== '/login') {
      router.replace('/login');
    }
  }, [loading, isAuthenticated, staffOk, pathname, router, logout]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Đang tải...
      </div>
    );
  }

  if (pathname === '/login') {
    if (isAuthenticated && staffOk) return null;
    return <>{children}</>;
  }

  if (!isAuthenticated || !staffOk) return null;

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
  if (loading) return <p className="text-slate-500">{vi.app.loading}</p>;
  if (user?.role !== role) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
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
  if (loading) return <p className="text-slate-500">Đang tải...</p>;
  if (!can(permission)) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <p className="font-medium text-amber-900">403 — {vi.app.noPermission}</p>
        <p className="mt-1 text-sm text-amber-800">Quyền: {permission}</p>
      </div>
    );
  }
  return <>{children}</>;
}
