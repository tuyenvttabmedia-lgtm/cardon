'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { RequirePermission } from '@/components/layout/AdminShell';
import { Card, StatCard } from '@/components/ui/Display';
import { Button, Input, Label } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';
import { cn, formatVnd } from '@/lib/utils';
import { financeApi } from '@/services/api-client';
import type { ProfitReport } from '@/types/api';
import { FinanceDateProvider, useFinanceDates } from './FinanceDateContext';

const SECTIONS = [
  { href: '/finance/dashboard', labelKey: 'navDashboard' as const, exact: true },
  { href: '/finance/payments', labelKey: 'navPayments' as const },
  { href: '/finance/providers', labelKey: 'navProviders' as const },
];

function FinanceSummaryBar() {
  const { dateFrom, dateTo, preset, applyPreset, setDateFrom, setDateTo } = useFinanceDates();
  const [profit, setProfit] = useState<ProfitReport | null>(null);
  const [gatewayFeeTotal, setGatewayFeeTotal] = useState<string | null>(null);

  useEffect(() => {
    void financeApi.getProfit(dateFrom, dateTo).then(setProfit).catch(() => setProfit(null));
    void financeApi
      .getGatewayFees(dateFrom, dateTo)
      .then((report) => {
        const total = report.rows.reduce((sum, row) => sum + Number(row.totalFee ?? 0), 0);
        setGatewayFeeTotal(String(total));
      })
      .catch(() => setGatewayFeeTotal(null));
  }, [dateFrom, dateTo]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        {(
          [
            ['today', 'Hôm nay'],
            ['7d', '7 ngày'],
            ['month', 'Tháng này'],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            size="sm"
            variant={preset === key ? 'primary' : 'secondary'}
            onClick={() => applyPreset(key)}
          >
            {label}
          </Button>
        ))}
        <div className="flex flex-wrap gap-2 md:ml-auto">
          <div>
            <Label className="text-xs">{vi.finance.dateFrom}</Label>
            <Input type="date" className="mt-1" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">{vi.finance.dateTo}</Label>
            <Input type="date" className="mt-1" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
      </div>
      {profit && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Doanh thu" value={formatVnd(profit.revenue)} />
          <StatCard label="Giá vốn" value={formatVnd(profit.providerCost)} />
          <StatCard label="Phí thanh toán" value={formatVnd(gatewayFeeTotal ?? '0')} />
          <StatCard label="Lợi nhuận" value={formatVnd(profit.grossProfit)} />
        </div>
      )}
    </div>
  );
}

function FinanceNav() {
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
            {vi.finance[item.labelKey]}
          </Link>
        );
      })}
    </nav>
  );
}

function FinanceShellInner({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{vi.finance.title}</h1>
        <p className="mt-1 text-sm text-zinc-500">{vi.finance.subtitle}</p>
      </div>
      <FinanceNav />
      <Card className="p-4">
        <FinanceSummaryBar />
      </Card>
      {children}
    </div>
  );
}

export function FinanceShell({ children }: { children: React.ReactNode }) {
  return (
    <RequirePermission permission="finance.view">
      <FinanceDateProvider>
        <FinanceShellInner>{children}</FinanceShellInner>
      </FinanceDateProvider>
    </RequirePermission>
  );
}
