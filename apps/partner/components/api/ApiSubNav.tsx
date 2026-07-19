'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export const API_CENTER_NAV = [
  { href: '/api/keys', label: 'Khóa API', exact: true },
  { href: '/api/ip-whitelist', label: 'IP Whitelist' },
  { href: '/api/webhook', label: 'Webhook', exact: true },
  { href: '/api/webhook/deliveries', label: 'Lịch sử giao' },
  { href: '/api/rate-limit', label: 'Rate Limit' },
  { href: '/api/security', label: 'Bảo mật' },
  { href: '/api/logs', label: 'Nhật ký API' },
  { href: '/api/docs', label: 'Tài liệu API' },
  { href: '/api/errors', label: 'Mã lỗi' },
  { href: '/api/sdk', label: 'SDK' },
  { href: '/api/test', label: 'Thử API' },
  { href: '/api/usage', label: 'Sử dụng API' },
] as const;

export function ApiSubNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 border-b border-slate-200 pb-3">
      {API_CENTER_NAV.map((item) => {
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
              active ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function ApiPageShell({
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
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Trung tâm API</p>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
      </div>
      <ApiSubNav />
      {children}
    </div>
  );
}
