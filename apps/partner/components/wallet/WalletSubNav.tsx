'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const WALLET_NAV = [
  { href: '/wallet', label: 'Tổng quan', exact: true },
  { href: '/finance/deposits', label: 'Nạp hạn mức' },
  { href: '/wallet/deposit-history', label: 'Lịch sử hạn mức' },
  { href: '/wallet/ledger', label: 'Biến động số dư' },
] as const;

export function WalletSubNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1 border-b border-slate-200 pb-3">
      {WALLET_NAV.map((item) => {
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

export function WalletPageShell({
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
      <WalletSubNav />
      {children}
    </div>
  );
}
