'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const ORDER_NAV = [
  { href: '/orders/search', label: 'Tra cứu', exact: true },
  { href: '/orders/history', label: 'Lịch sử' },
  { href: '/orders/timeline', label: 'Timeline' },
] as const;

export function OrdersSubNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 border-b border-slate-200 pb-3 dark:border-slate-700">
      {ORDER_NAV.map((item) => {
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
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function OrdersPageShell({
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
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Đơn hàng API</p>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{description}</p>}
      </div>
      <OrdersSubNav />
      {children}
    </div>
  );
}
