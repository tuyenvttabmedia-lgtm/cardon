'use client';

import { usePathname } from 'next/navigation';
import { SectionNav } from '@/components/ui/Navigation';
import { useAuth } from '@/hooks/useAuth';
import { vi } from '@/lib/i18n/vi';

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
    <SectionNav
      ariaLabel="Điều hướng vận hành"
      items={SECTIONS.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return { href: item.href, label: item.label, active };
      })}
    />
  );
}

export function OperationsShell({ children }: { children: React.ReactNode }) {
  const { can, loading } = useAuth();

  if (loading) return <p className="text-slate-500">{vi.operations.loading}</p>;

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
        <h1 className="admin-page-title">{vi.operations.title}</h1>
        <p className="admin-page-subtitle">{vi.operations.subtitle}</p>
      </div>
      <OperationsNav />
      {children}
    </div>
  );
}
