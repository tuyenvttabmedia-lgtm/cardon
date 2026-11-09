'use client';

import { Card } from '@/components/ui/Display';
import { Button } from '@/components/ui/Form';
import { CustomerOrdersTab } from '@/components/customers/CustomerOrdersTab';
import { CustomerOverviewTab } from '@/components/customers/CustomerOverviewTab';
import { CustomerSecurityTab } from '@/components/customers/CustomerSecurityTab';
import { vi } from '@/lib/i18n/vi';
import { cn } from '@/lib/utils';
import type { AdminCustomerDetail } from '@/types/api';

export type CustomerDetailTab = 'overview' | 'orders' | 'security';

const TABS: { id: CustomerDetailTab; label: string }[] = [
  { id: 'overview', label: vi.customers.tabOverview },
  { id: 'orders', label: vi.customers.tabOrders },
  { id: 'security', label: vi.customers.tabSecurity },
];

export function CustomerDetailPanel({
  detail,
  loading,
  tab,
  canManage,
  showBack,
  onTabChange,
  onBack,
  onToggleLock,
  onResetPassword,
  onOrderPageChange,
  onOrderTakeChange,
  onLoginPageChange,
  onLoginTakeChange,
}: {
  detail: AdminCustomerDetail | null;
  loading: boolean;
  tab: CustomerDetailTab;
  canManage: boolean;
  showBack: boolean;
  onTabChange: (tab: CustomerDetailTab) => void;
  onBack: () => void;
  onToggleLock: () => void;
  onResetPassword: () => void;
  onOrderPageChange: (skip: number) => void;
  onOrderTakeChange: (take: number) => void;
  onLoginPageChange: (skip: number) => void;
  onLoginTakeChange: (take: number) => void;
}) {
  if (!detail && !loading) {
    return (
      <Card className="flex h-full min-h-[20rem] items-center justify-center p-6">
        <p className="max-w-sm text-center text-sm text-slate-500">{vi.customers.emptySelect}</p>
      </Card>
    );
  }

  return (
    <Card className="flex h-full min-h-0 flex-col p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {showBack ? (
            <Button size="sm" variant="ghost" className="mb-1 -ml-2" onClick={onBack}>
              {vi.customers.backToList}
            </Button>
          ) : null}
          <h2 className="truncate text-base font-semibold text-slate-900">
            {detail?.profile.fullName ?? detail?.profile.email ?? vi.customers.loading}
          </h2>
          {detail ? (
            <p className="truncate text-sm text-slate-500">{detail.profile.email}</p>
          ) : null}
        </div>
        {loading ? <span className="text-xs text-slate-400">{vi.customers.loading}</span> : null}
      </div>

      <div className="mb-3 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onTabChange(item.id)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition',
              tab === item.id
                ? 'bg-admin-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {!detail ? (
          <p className="text-sm text-slate-500">{vi.customers.loading}</p>
        ) : tab === 'overview' ? (
          <CustomerOverviewTab
            detail={detail}
            canManage={canManage}
            onToggleLock={onToggleLock}
            onResetPassword={onResetPassword}
          />
        ) : tab === 'orders' ? (
          <CustomerOrdersTab
            detail={detail}
            onPageChange={onOrderPageChange}
            onTakeChange={onOrderTakeChange}
          />
        ) : (
          <CustomerSecurityTab
            detail={detail}
            onLoginPageChange={onLoginPageChange}
            onLoginTakeChange={onLoginTakeChange}
          />
        )}
      </div>
    </Card>
  );
}
