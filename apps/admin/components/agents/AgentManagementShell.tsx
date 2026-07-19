'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { RequirePermission } from '@/components/layout/AdminShell';
import { AGENT_SECTIONS } from '@/lib/agent-routes';
import { vi } from '@/lib/i18n/vi';
import { cn } from '@/lib/utils';

export function AgentManagementShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDetail = /^\/agents\/[0-9a-f-]{36}$/i.test(pathname);

  return (
    <RequirePermission permission="users.read">
      <div className="space-y-6">
        {!isDetail && (
          <>
            <div>
              <h1 className="text-2xl font-bold">{vi.agentCenter.title}</h1>
              <p className="mt-1 text-sm text-zinc-500">{vi.agentCenter.subtitle}</p>
            </div>
            <nav className="flex flex-wrap gap-2 border-b border-zinc-200 pb-3">
              {AGENT_SECTIONS.map((item) => {
                const active =
                  'exact' in item && item.exact
                    ? pathname === item.href
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-sm font-medium',
                      active ? 'bg-admin-600 text-white' : 'text-zinc-600 hover:bg-zinc-100',
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </>
        )}
        {children}
      </div>
    </RequirePermission>
  );
}
