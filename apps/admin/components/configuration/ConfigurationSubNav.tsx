'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CONFIGURATION_SECTIONS } from '@/lib/configuration-routes';
import { vi } from '@/lib/i18n/vi';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

export function ConfigurationSubNav() {
  const pathname = usePathname();
  const { can } = useAuth();
  const canManage = can('configuration.manage');

  const visible = CONFIGURATION_SECTIONS.filter((item) => {
    if ('permission' in item && item.permission && !can(item.permission)) return false;
    return true;
  });

  return (
    <aside className="w-full shrink-0 lg:sticky lg:top-20 lg:w-60">
      <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
        {vi.configuration.title}
      </p>
      <nav className="space-y-1 rounded-xl border border-slate-200/80 bg-white p-2 shadow-panel">
        {visible.map((item) => {
          const active =
            'exact' in item && item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'block rounded-lg border-l-2 px-3 py-2.5 text-sm font-medium transition-all duration-150',
                active
                  ? 'border-admin-500 bg-admin-50 text-admin-800 shadow-sm'
                  : 'border-transparent text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950',
                item.href === '/configuration/audit' && !active && 'mt-2 border-t border-slate-100 pt-3',
              )}
            >
              {item.label}
            </Link>
          );
        })}
        {!canManage && (
          <p className="px-3 py-2 text-xs text-slate-400">{vi.configuration.readOnlyHint}</p>
        )}
      </nav>
    </aside>
  );
}
