'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import {
  Activity,
  ChevronDown,
  CreditCard,
  Headset,
  Layers,
  LayoutDashboard,
  Megaphone,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  RefreshCcw,
  Search,
  Settings,
  ShoppingCart,
  Smartphone,
  Truck,
  UserCog,
  Users,
  Wallet,
  Workflow,
  X,
  type LucideProps,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSidebarBadges } from '@/hooks/useSidebarBadges';
import { BuildInfoService } from '@/lib/build-version';
import {
  NAV_GROUPS,
  NAV_ITEMS,
  canAccessNavItem,
  defaultRouteForRole,
  normalizeNavSearch,
  resolveActiveNavHref,
  type NavGroupId,
  type NavIconName,
  type NavItem,
} from '@/lib/permissions';
import { cn } from '@/lib/utils';

const STORAGE_COLLAPSED = 'cardon.admin.sidebar.collapsed';
const STORAGE_GROUPS = 'cardon.admin.sidebar.groups';

const ICON_MAP: Record<NavIconName, ComponentType<LucideProps>> = {
  'layout-dashboard': LayoutDashboard,
  'shopping-cart': ShoppingCart,
  receipt: Receipt,
  smartphone: Smartphone,
  package: Package,
  layers: Layers,
  users: Users,
  megaphone: Megaphone,
  wallet: Wallet,
  'credit-card': CreditCard,
  'refresh-ccw': RefreshCcw,
  workflow: Workflow,
  truck: Truck,
  headset: Headset,
  activity: Activity,
  'user-cog': UserCog,
  settings: Settings,
};

function readCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_COLLAPSED) === '1';
  } catch {
    return false;
  }
}

function readOpenGroups(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_GROUPS);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function formatBadge(n: number): string {
  if (n > 99) return '99+';
  return String(n);
}

function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  const Icon = ICON_MAP[name];
  return <Icon className={cn('h-[18px] w-[18px] shrink-0', className)} strokeWidth={1.75} aria-hidden />;
}

function SidebarBrand({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const { user, permissions } = useAuth();
  const homeHref = defaultRouteForRole(user?.role ?? '', permissions);
  return (
    <Link
      href={homeHref}
      className={cn('group block min-w-0', collapsed && 'flex justify-center')}
      onClick={onNavigate}
      title="CardOn Admin"
    >
      {collapsed ? (
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-sm font-bold text-[#FF647C]">
          C
        </span>
      ) : (
        <>
          <span className="text-[17px] font-bold tracking-tight text-white">
            CardOn <span className="text-[#FF647C]">Admin</span>
          </span>
          <span className="mt-0.5 block text-[11px] font-medium text-[#8290A8]">
            Trung tâm vận hành
          </span>
        </>
      )}
    </Link>
  );
}

function NavLinkRow({
  item,
  active,
  collapsed,
  badge,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  badge?: number;
  onNavigate?: () => void;
}) {
  const showBadge = typeof badge === 'number' && badge > 0;
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      aria-current={active ? 'page' : undefined}
      aria-label={
        showBadge ? `${item.label}, ${badge} việc cần xử lý` : item.label
      }
      onClick={onNavigate}
      className={cn(
        'group/item relative flex h-[37px] items-center gap-2.5 rounded-md border-l-2 text-[13px] font-medium transition-colors duration-150',
        collapsed ? 'justify-center px-0' : 'px-2.5',
        active
          ? 'border-[#FF647C] bg-[#20283A] text-white'
          : 'border-transparent text-[#D5DCEC] hover:bg-[#151D30] hover:text-white',
      )}
    >
      <span className="relative shrink-0">
        <NavIcon name={item.icon} className={active ? 'text-[#FF647C]' : 'text-[#8290A8] group-hover/item:text-[#D5DCEC]'} />
        {collapsed && showBadge ? (
          <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[#FF647C]" />
        ) : null}
      </span>
      {!collapsed ? (
        <>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {showBadge ? (
            <span className="shrink-0 rounded-md bg-[#FF647C] px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
              {formatBadge(badge)}
            </span>
          ) : null}
        </>
      ) : null}
    </Link>
  );
}

function CollapsedGroupButton({
  groupId,
  label,
  items,
  activeHref,
  badges,
  onNavigate,
}: {
  groupId: NavGroupId;
  label: string;
  items: NavItem[];
  activeHref: string | null;
  badges: ReturnType<typeof useSidebarBadges>;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const groupActive = items.some((i) => i.href === activeHref);
  const leadIcon = items[0]?.icon ?? 'settings';

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-[37px] w-full items-center justify-center rounded-md border-l-2 transition-colors',
          groupActive
            ? 'border-[#FF647C] bg-[#20283A] text-white'
            : 'border-transparent text-[#8290A8] hover:bg-[#151D30] hover:text-white',
        )}
      >
        <NavIcon name={leadIcon} className={groupActive ? 'text-[#FF647C]' : undefined} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute left-full top-0 z-50 ml-2 min-w-[200px] rounded-lg border border-white/10 bg-[#080D1C] py-1.5 shadow-xl"
        >
          <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8290A8]">
            {label}
          </p>
          {items.map((item) => (
            <NavLinkRow
              key={`${groupId}-${item.href}`}
              item={item}
              active={item.href === activeHref}
              collapsed={false}
              badge={item.badgeKey ? badges[item.badgeKey] : undefined}
              onNavigate={() => {
                setOpen(false);
                onNavigate?.();
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SidebarNav({
  collapsed = false,
  onNavigate,
  enableBadges = true,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
  enableBadges?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { permissions, user } = useAuth();
  const badges = useSidebarBadges(enableBadges);
  const [query, setQuery] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setOpenGroups(readOpenGroups());
  }, []);

  const visibleItems = useMemo(
    () =>
      NAV_ITEMS.filter((item) =>
        canAccessNavItem(item, permissions, user?.role ?? ''),
      ),
    [permissions, user?.role],
  );

  const activeHref = useMemo(
    () => resolveActiveNavHref(pathname, visibleItems),
    [pathname, visibleItems],
  );

  const groupById = useMemo(() => {
    const map = new Map<NavGroupId, { label: string; hideHeader?: boolean }>();
    for (const g of NAV_GROUPS) map.set(g.id, g);
    return map;
  }, []);

  const filteredItems = useMemo(() => {
    const q = normalizeNavSearch(query);
    if (!q) return visibleItems;
    return visibleItems.filter((item) => {
      const groupLabel = groupById.get(item.group)?.label ?? '';
      return (
        normalizeNavSearch(item.label).includes(q) ||
        normalizeNavSearch(item.href).includes(q) ||
        normalizeNavSearch(groupLabel).includes(q)
      );
    });
  }, [groupById, query, visibleItems]);

  const itemsByGroup = useMemo(() => {
    const map = new Map<NavGroupId, NavItem[]>();
    for (const item of filteredItems) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return map;
  }, [filteredItems]);

  const activeGroupId = useMemo(() => {
    const item = visibleItems.find((i) => i.href === activeHref);
    return item?.group ?? null;
  }, [activeHref, visibleItems]);

  const persistGroups = useCallback((next: Record<string, boolean>) => {
    setOpenGroups(next);
    try {
      window.localStorage.setItem(STORAGE_GROUPS, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  function isGroupOpen(id: NavGroupId): boolean {
    if (query.trim()) return true;
    if (activeGroupId === id) return true;
    if (openGroups[id] === false) return false;
    if (openGroups[id] === true) return true;
    return true;
  }

  function toggleGroup(id: NavGroupId) {
    // Keep active group open visually even if user collapses — store preference but
    // isGroupOpen still forces open while route is active.
    const currentlyOpen = openGroups[id] !== false;
    persistGroups({ ...openGroups, [id]: !currentlyOpen });
  }

  const groupsToRender = NAV_GROUPS.filter(
    (g) => (itemsByGroup.get(g.id)?.length ?? 0) > 0,
  );

  function selectSearchResult(item: NavItem) {
    setQuery('');
    if (!item.group || groupById.get(item.group)?.hideHeader) {
      router.push(item.href);
      onNavigate?.();
      return;
    }
    persistGroups({ ...openGroups, [item.group]: true });
    router.push(item.href);
    onNavigate?.();
  }

  return (
    <nav
      className={cn(
        'flex min-h-0 flex-1 flex-col',
        collapsed ? 'px-1.5' : 'px-2.5',
      )}
      aria-label="Điều hướng chính"
    >
      {!collapsed ? (
        <div className="relative shrink-0 pb-2 pt-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8290A8]"
            strokeWidth={1.75}
            aria-hidden
          />
          <label className="sr-only" htmlFor="admin-sidebar-search">
            Tìm chức năng
          </label>
          <input
            ref={searchRef}
            id="admin-sidebar-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && filteredItems[0]) {
                e.preventDefault();
                selectSearchResult(filteredItems[0]);
              }
            }}
            placeholder="Tìm chức năng..."
            className="h-9 w-full rounded-md border border-white/10 bg-white/[0.04] py-2 pl-8 pr-8 text-[13px] text-[#D5DCEC] placeholder:text-[#8290A8] focus:border-[#FF647C]/40 focus:outline-none focus:ring-1 focus:ring-[#FF647C]/30"
          />
          {query ? (
            <button
              type="button"
              aria-label="Xóa tìm kiếm"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-[#8290A8] hover:text-white"
              onClick={() => {
                setQuery('');
                searchRef.current?.focus();
              }}
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden pb-2 [scrollbar-gutter:stable]">
        {groupsToRender.length === 0 ? (
          <p className="px-2 py-3 text-xs text-[#8290A8]">Không tìm thấy chức năng.</p>
        ) : null}

        {groupsToRender.map((group) => {
          const items = itemsByGroup.get(group.id) ?? [];
          if (collapsed) {
            if (group.hideHeader || items.length === 1) {
              return (
                <div key={group.id} className="space-y-0.5">
                  {items.map((item) => (
                    <NavLinkRow
                      key={item.href}
                      item={item}
                      active={item.href === activeHref}
                      collapsed
                      badge={item.badgeKey ? badges[item.badgeKey] : undefined}
                      onNavigate={onNavigate}
                    />
                  ))}
                </div>
              );
            }
            return (
              <CollapsedGroupButton
                key={group.id}
                groupId={group.id}
                label={group.label}
                items={items}
                activeHref={activeHref}
                badges={badges}
                onNavigate={onNavigate}
              />
            );
          }

          const open = group.hideHeader ? true : isGroupOpen(group.id);
          const showHeader = !group.hideHeader;

          return (
            <div key={group.id} className="space-y-0.5">
              {showHeader ? (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={open}
                  className="flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8290A8] transition-colors hover:text-[#A8B4C8]"
                >
                  <span className="flex-1 whitespace-nowrap">{group.label}</span>
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 shrink-0 transition-transform',
                      open ? 'rotate-0' : '-rotate-90',
                    )}
                    strokeWidth={2}
                    aria-hidden
                  />
                </button>
              ) : null}
              {open
                ? items.map((item) => (
                    <NavLinkRow
                      key={item.href}
                      item={item}
                      active={item.href === activeHref}
                      collapsed={false}
                      badge={item.badgeKey ? badges[item.badgeKey] : undefined}
                      onNavigate={onNavigate}
                    />
                  ))
                : null}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

export function DesktopSidebar() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(readCollapsed());
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_COLLAPSED, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <aside
      className={cn(
        'hidden shrink-0 flex-col border-r border-white/5 bg-[#080D1C] shadow-xl transition-[width] duration-200 lg:sticky lg:top-0 lg:flex lg:h-screen',
        collapsed ? 'w-[68px]' : 'w-[248px]',
      )}
    >
      <div
        className={cn(
          'flex h-[72px] shrink-0 items-center gap-2 border-b border-white/5',
          collapsed ? 'justify-center px-1.5' : 'px-3',
        )}
      >
        <div className="min-w-0 flex-1">
          <SidebarBrand collapsed={collapsed} />
        </div>
        {!collapsed ? (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Thu gọn sidebar"
            title="Thu gọn"
            className="rounded-md p-1.5 text-[#8290A8] hover:bg-[#151D30] hover:text-white"
          >
            <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
          </button>
        ) : null}
      </div>
      {collapsed ? (
        <div className="flex shrink-0 justify-center border-b border-white/5 py-2">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Mở rộng sidebar"
            title="Mở rộng"
            className="rounded-md p-1.5 text-[#8290A8] hover:bg-[#151D30] hover:text-white"
          >
            <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      ) : null}

      <SidebarNav collapsed={collapsed} />

      <div
        className={cn(
          'shrink-0 border-t border-white/5 text-[11px] text-[#8290A8]',
          collapsed ? 'px-1 py-2 text-center' : 'h-11 px-3 py-2.5',
        )}
        title={BuildInfoService.footerLabel()}
      >
        {collapsed ? 'v' : BuildInfoService.footerLabel()}
      </div>
    </aside>
  );
}

export { SidebarBrand };
