'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { vi } from '@/lib/i18n/vi';
import { cn } from '@/lib/utils';

const SECTIONS = [
  { href: '/operations', label: vi.operations.navOverview, exact: true },
  { href: '/operations/reconciliation', label: vi.operations.navReconciliation },
  { href: '/operations/exceptions', label: vi.operations.navExceptions },
  { href: '/operations/manual', label: vi.operations.navManual },
  { href: '/operations/invoices', label: vi.operations.navInvoices },
];

function OperationsNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2 border-b border-zinc-200 pb-3">
      {SECTIONS.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium',
              active ? 'bg-admin-100 text-admin-800' : 'text-zinc-600 hover:bg-zinc-50',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function OperationsShell({ children }: { children: React.ReactNode }) {
  const { can, loading } = useAuth();

  if (loading) return <p className="text-zinc-500">{vi.operations.loading}</p>;

  if (!can('reconciliation.read') && !can('finance.view')) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <p className="font-medium text-amber-900">403 — {vi.app.noPermission}</p>
        <p className="mt-1 text-sm text-amber-800">{vi.app.noPermissionHint}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{vi.operations.title}</h1>
        <p className="mt-1 text-sm text-zinc-500">{vi.operations.subtitle}</p>
      </div>
      <OperationsNav />
      {children}
    </div>
  );
}
