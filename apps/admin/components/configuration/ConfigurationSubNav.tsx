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
    <aside className="sticky top-4 w-full shrink-0 lg:w-56">
      <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {vi.configuration.title}
      </p>
      <nav className="space-y-0.5 rounded-xl border border-zinc-200 bg-white p-2">
        {visible.map((item) => {
          const active =
            'exact' in item && item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'block rounded-lg px-3 py-2 text-sm font-medium transition',
                active ? 'bg-admin-600 text-white' : 'text-zinc-700 hover:bg-zinc-100',
                item.href === '/configuration/audit' && !active && 'mt-1 border-t border-zinc-100 pt-3',
              )}
            >
              {item.label}
            </Link>
          );
        })}
        {!canManage && (
          <p className="px-3 py-2 text-xs text-zinc-400">{vi.configuration.readOnlyHint}</p>
        )}
      </nav>
    </aside>
  );
}
