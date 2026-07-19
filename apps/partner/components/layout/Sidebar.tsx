'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useAgentPlatform } from '@/hooks/useAgentPlatform';
import { useOnboarding } from '@/contexts/OnboardingContext';
import {
  AGENT_ONBOARDING_NAV,
  AGENT_PLATFORM_NAV,
  filterPlatformNavItems,
  type AgentNavItem,
} from '@/lib/agent-platform/navigation';
import { BuildInfoService } from '@/lib/build-version';
import { Button } from '@/components/ui/Button';

function resolveNavItems(
  fullyOnboarded: boolean,
  can: (permission: AgentNavItem['permission']) => boolean,
): AgentNavItem[] {
  if (!fullyOnboarded) {
    return AGENT_ONBOARDING_NAV.filter((item) => can(item.permission));
  }
  return filterPlatformNavItems(AGENT_PLATFORM_NAV).filter((item) => can(item.permission));
}

function NavLinks({
  items,
  pathname,
  can,
  compact,
}: {
  items: AgentNavItem[];
  pathname: string;
  can: (permission: AgentNavItem['permission']) => boolean;
  compact?: boolean;
}) {
  return (
    <>
      {items.map((item) => {
        const active =
          'exact' in item && item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const childActive = item.children?.some(
          (c) => pathname === c.href || pathname.startsWith(`${c.href}/`),
        );
        const showChildren = !compact && item.children && (active || childActive);

        return (
          <div key={item.href}>
            <Link
              href={item.href}
              className={cn(
                compact
                  ? 'whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium'
                  : 'block rounded-lg px-3 py-2.5 text-sm font-medium transition',
                active || childActive
                  ? compact
                    ? 'bg-indigo-600 text-white'
                    : 'bg-indigo-600 text-white shadow-sm'
                  : compact
                    ? 'text-slate-600 hover:bg-slate-100'
                    : 'text-slate-300 hover:bg-slate-900 hover:text-white',
              )}
            >
              {item.label}
            </Link>
            {showChildren && (
              <div className="ml-3 mt-0.5 space-y-0.5 border-l border-slate-800 pl-2">
                {item.children!
                  .filter((c) => can(c.permission))
                  .map((child) => {
                    const exactRoots = ['/wallet', '/orders/search', '/api/keys'];
                    const childIsActive =
                      'exact' in child && child.exact
                        ? pathname === child.href
                        : exactRoots.includes(child.href)
                          ? pathname === child.href
                          : pathname === child.href || pathname.startsWith(`${child.href}/`);
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          'block rounded-md px-2 py-1.5 text-xs font-medium transition',
                          childIsActive ? 'text-indigo-300' : 'text-slate-400 hover:text-slate-200',
                        )}
                      >
                        {child.label}
                      </Link>
                    );
                  })}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { can } = useAgentPlatform();
  const { fullyOnboarded, status, redirectPath } = useOnboarding();
  const homeHref = fullyOnboarded ? '/dashboard' : redirectPath;
  const items = resolveNavItems(fullyOnboarded, can);

  return (
    <aside className="flex h-full w-full flex-col border-r border-slate-200 bg-slate-950 text-slate-100">
      <div className="border-b border-slate-800 px-5 py-5">
        <Link href={homeHref} className="block">
          <span className="text-lg font-bold tracking-tight text-white">CardOn</span>
          <span className="mt-0.5 block text-xs font-medium uppercase tracking-widest text-indigo-300">
            Nền tảng Đại lý
          </span>
        </Link>
        {user && <p className="mt-3 truncate text-xs text-slate-400">{user.email}</p>}
        {!fullyOnboarded && (
          <p className="mt-2 rounded-md bg-amber-500/15 px-2 py-1 text-[11px] font-medium text-amber-200">
            Hoàn tất xác minh để mở khóa dịch vụ
          </p>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        <NavLinks items={items} pathname={pathname} can={can} />
      </nav>

      <div className="space-y-3 border-t border-slate-800 p-4">
        <p className="text-[10px] uppercase tracking-wide text-slate-500">{BuildInfoService.footerLabel()}</p>
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start text-slate-300 hover:bg-slate-900 hover:text-white"
          onClick={() => void logout()}
        >
          Đăng xuất
        </Button>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const { can } = useAgentPlatform();
  const { fullyOnboarded, status } = useOnboarding();
  const items = resolveNavItems(fullyOnboarded, can);

  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-2 py-2 lg:hidden">
      <NavLinks items={items} pathname={pathname} can={can} compact />
    </div>
  );
}
