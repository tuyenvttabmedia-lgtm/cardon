'use client';

import { usePathname } from 'next/navigation';
import { RequirePermission } from '@/components/layout/AdminShell';
import { Button, Input, Label } from '@/components/ui/Form';
import { SectionNav } from '@/components/ui/Navigation';
import { vi } from '@/lib/i18n/vi';
import { FinanceDateProvider, useFinanceDates } from './FinanceDateContext';

const SECTIONS = [
  { href: '/finance/supplier', label: 'Đối soát NCC', exact: false },
  { href: '/finance/retail', label: 'HĐ đầu ra bán lẻ', exact: false },
  { href: '/finance/gateway-fee', label: 'Phí cổng TT', exact: false },
  { href: '/finance/summary', label: 'Tổng hợp tháng', exact: false },
];

function FinanceDateBar() {
  const { dateFrom, dateTo, preset, applyPreset, setDateFrom, setDateTo } = useFinanceDates();

  return (
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
          <Input
            type="date"
            className="mt-1"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">{vi.finance.dateTo}</Label>
          <Input
            type="date"
            className="mt-1"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

function FinanceNav() {
  const pathname = usePathname();
  return (
    <SectionNav
      ariaLabel="Tài chính VAT"
      items={SECTIONS.map((s) => ({
        href: s.href,
        label: s.label,
        active: pathname === s.href || pathname.startsWith(`${s.href}/`),
      }))}
    />
  );
}

function FinanceShellInner({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{vi.finance.title}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Hóa đơn GTGT theo ngày — NCC · bán lẻ (tách 10%/8%) · phí cổng · tổng hợp. Không gồm đại lý.
        </p>
      </div>
      <FinanceNav />
      <FinanceDateBar />
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
