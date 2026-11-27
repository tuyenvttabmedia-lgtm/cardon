'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { RequirePermission } from '@/components/layout/AdminShell';
import { Button, Input, Label } from '@/components/ui/Form';
import { SectionNav } from '@/components/ui/Navigation';
import { vi } from '@/lib/i18n/vi';
import {
  FinanceDateProvider,
  financeDefaultPresetForPath,
  isFinanceYesterdayDefaultPath,
  useFinanceDates,
  type FinanceQuickPreset,
} from './FinanceDateContext';

const SECTIONS = [
  { href: '/finance/esim', label: 'eSIM', exact: false },
  { href: '/finance/supplier', label: 'Đối soát eSale', exact: false },
  { href: '/finance/retail', label: 'HĐ đầu ra bán lẻ', exact: false },
  { href: '/finance/gateway-fee', label: 'Phí cổng TT', exact: false },
  { href: '/finance/summary', label: 'Tổng hợp tháng', exact: false },
];

const DATE_PRESETS: Array<[FinanceQuickPreset, string]> = [
  ['today', vi.finance.filterToday],
  ['yesterday', vi.finance.filterYesterday],
  ['7d', vi.finance.filter7d],
  ['month', vi.finance.filterThisMonth],
  ['lastMonth', vi.finance.filterLastMonth],
];

function FinanceDateBar() {
  const { dateFrom, dateTo, preset, applyPreset, setDateFrom, setDateTo } = useFinanceDates();

  return (
    <div className="flex flex-wrap items-end gap-2">
      {DATE_PRESETS.map(([key, label]) => (
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

/** Khi vào tab eSale / HĐ đầu ra từ tab khác → reset về Hôm qua. */
function FinanceTabDateDefaultSync({ pathname }: { pathname: string }) {
  const { applyPreset } = useFinanceDates();
  const wantsYesterday = isFinanceYesterdayDefaultPath(pathname);
  const wasYesterdayTab = useRef(wantsYesterday);

  useEffect(() => {
    if (wantsYesterday && !wasYesterdayTab.current) {
      applyPreset('yesterday');
    }
    wasYesterdayTab.current = wantsYesterday;
  }, [wantsYesterday, applyPreset]);

  return null;
}

function FinanceNav() {
  const pathname = usePathname();
  return (
    <SectionNav
      ariaLabel="Tài chính"
      items={SECTIONS.map((s) => ({
        href: s.href,
        label: s.label,
        active: pathname === s.href || pathname.startsWith(`${s.href}/`),
      }))}
    />
  );
}

function FinanceShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isEsim = pathname === '/finance/esim' || pathname.startsWith('/finance/esim/');
  return (
    <div className="space-y-4">
      <FinanceTabDateDefaultSync pathname={pathname} />
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{vi.finance.title}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {isEsim
            ? 'Lane eSIM — Doanh thu (F1) và đối soát PayPal fee CSV (F3). VND/USD tách. Không trộn VAT/Profit thẻ game.'
            : 'Hóa đơn GTGT theo ngày — eSale · bán lẻ (tách 10%/8%) · phí cổng · tổng hợp. Không gồm đại lý / eSIM.'}
        </p>
      </div>
      <FinanceNav />
      <FinanceDateBar />
      {children}
    </div>
  );
}

export function FinanceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const initialPreset = financeDefaultPresetForPath(pathname);

  return (
    <RequirePermission permission="finance.view">
      <FinanceDateProvider initialPreset={initialPreset}>
        <FinanceShellInner>{children}</FinanceShellInner>
      </FinanceDateProvider>
    </RequirePermission>
  );
}
