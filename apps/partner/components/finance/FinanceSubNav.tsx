'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const FINANCE_NAV = [
  { href: '/finance', label: 'Tổng quan', exact: true },
  { href: '/finance/deposits', label: 'Nạp tiền' },
  { href: '/finance/withdraws', label: 'Rút tiền' },
  { href: '/finance/settlements', label: 'Đối soát' },
  { href: '/finance/adjustments', label: 'Điều chỉnh' },
  { href: '/finance/credit', label: 'Công nợ & Hạn mức' },
  { href: '/finance/history', label: 'Lịch sử tài chính' },
] as const;

export function FinanceSubNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1 border-b border-slate-200 pb-3">
      {FINANCE_NAV.map((item) => {
        const active =
          'exact' in item && item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'rounded-lg px-3 py-2 text-sm font-medium transition',
              active
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function FinancePageShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
      </div>
      <FinanceSubNav />
      {children}
    </div>
  );
}
