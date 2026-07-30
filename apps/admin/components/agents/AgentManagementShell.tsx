'use client';

import { usePathname } from 'next/navigation';
import { RequirePermission } from '@/components/layout/AdminShell';
import { SectionNav } from '@/components/ui/Navigation';
import { AGENT_SECTIONS } from '@/lib/agent-routes';
import { vi } from '@/lib/i18n/vi';

export function AgentManagementShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDetail = /^\/agents\/[0-9a-f-]{36}$/i.test(pathname);

  return (
    <RequirePermission permission="users.read">
      <div className="space-y-6">
        {!isDetail && (
          <>
            <div>
              <h1 className="admin-page-title">{vi.agentCenter.title}</h1>
              <p className="admin-page-subtitle">{vi.agentCenter.subtitle}</p>
            </div>
            <SectionNav
              ariaLabel="Điều hướng quản lý đại lý"
              items={AGENT_SECTIONS.map((item) => {
                const active =
                  'exact' in item && item.exact
                    ? pathname === item.href
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return { href: item.href, label: item.label, active };
              })}
            />
          </>
        )}
        {children}
      </div>
    </RequirePermission>
  );
}
