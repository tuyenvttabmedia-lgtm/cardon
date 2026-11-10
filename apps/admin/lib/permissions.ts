import { vi } from '@/lib/i18n/vi';

export type NavGroupId =
  | 'overview'
  | 'commerce'
  | 'finance'
  | 'agents'
  | 'ops'
  | 'monitoring'
  | 'admin';

/** How sidebar highlights this item against the current pathname. */
export type NavMatchMode =
  | 'exact'
  | 'prefix'
  | 'orders-retail'
  | 'products'
  | 'products-esim'
  | 'finance-hub'
  | 'agents-hub'
  | 'operations-hub'
  | 'configuration-hub';

export type SidebarBadgeKey =
  | 'retailNmr'
  | 'esimNmr'
  | 'refundNeedsAction'
  | 'opsExceptions'
  | 'agentKycPending';

/** Lucide icon name used by AdminSidebar (must exist in lucide-react). */
export type NavIconName =
  | 'layout-dashboard'
  | 'shopping-cart'
  | 'receipt'
  | 'smartphone'
  | 'package'
  | 'layers'
  | 'users'
  | 'megaphone'
  | 'wallet'
  | 'credit-card'
  | 'refresh-ccw'
  | 'workflow'
  | 'truck'
  | 'headset'
  | 'activity'
  | 'user-cog'
  | 'settings';

export interface NavItem {
  href: string;
  label: string;
  group: NavGroupId;
  icon: NavIconName;
  match?: NavMatchMode;
  badgeKey?: SidebarBadgeKey;
  permission?: string;
  permissions?: string[];
  roles?: string[];
  /** When set, only these roles see this item (in addition to permission checks). */
  visibleForRoles?: string[];
}

export interface NavGroup {
  id: NavGroupId;
  label: string;
  /** Overview stands alone — no group heading. */
  hideHeader?: boolean;
}

/** Short group labels (D2-B2 UI refinement) — must fit 248px without ellipsis. */
export const NAV_GROUPS: NavGroup[] = [
  { id: 'overview', label: 'Tổng quan', hideHeader: true },
  { id: 'commerce', label: 'BÁN HÀNG' },
  { id: 'finance', label: 'TÀI CHÍNH' },
  { id: 'agents', label: 'ĐẠI LÝ' },
  { id: 'ops', label: 'VẬN HÀNH' },
  { id: 'monitoring', label: 'GIÁM SÁT' },
  { id: 'admin', label: 'QUẢN TRỊ' },
];

/** Sidebar items shown to SUPER_ADMIN / ADMIN (default full menu). */
export const NAV_ITEMS: NavItem[] = [
  {
    href: '/dashboard',
    label: vi.nav.dashboard,
    group: 'overview',
    icon: 'layout-dashboard',
    match: 'exact',
    permission: 'admin.dashboard',
  },
  // BÁN HÀNG
  {
    href: '/orders',
    label: 'Đơn bán lẻ',
    group: 'commerce',
    icon: 'shopping-cart',
    match: 'orders-retail',
    badgeKey: 'retailNmr',
    permission: 'orders.read',
  },
  {
    href: '/orders/agent',
    label: 'Đơn đại lý',
    group: 'commerce',
    icon: 'receipt',
    match: 'prefix',
    permission: 'orders.read',
  },
  {
    href: '/esim-ops',
    label: vi.nav.esimOps,
    group: 'commerce',
    icon: 'smartphone',
    match: 'prefix',
    badgeKey: 'esimNmr',
    permission: 'orders.read',
  },
  {
    href: '/products',
    label: vi.nav.products,
    group: 'commerce',
    icon: 'package',
    match: 'products',
    permission: 'products.manage',
  },
  {
    href: '/products/esim',
    label: 'Catalog eSIM',
    group: 'commerce',
    icon: 'layers',
    match: 'products-esim',
    permission: 'products.manage',
  },
  {
    href: '/customers',
    label: vi.nav.customers,
    group: 'commerce',
    icon: 'users',
    match: 'prefix',
    permission: 'customers.read',
  },
  {
    href: '/marketing',
    label: vi.nav.marketing,
    group: 'commerce',
    icon: 'megaphone',
    match: 'prefix',
    permission: 'cms.manage',
  },
  // TÀI CHÍNH
  {
    href: '/finance/supplier',
    label: vi.nav.finance,
    group: 'finance',
    icon: 'wallet',
    match: 'finance-hub',
    permission: 'finance.view',
  },
  {
    href: '/payments',
    label: vi.nav.payments,
    group: 'finance',
    icon: 'credit-card',
    match: 'prefix',
    permission: 'payments.view',
    // D2-B2: ADMIN sees Payments when payments.view; SUPPORT/ACCOUNTANT unchanged; SUPER_ADMIN bypass.
    visibleForRoles: ['SUPPORT', 'ACCOUNTANT', 'ADMIN'],
  },
  {
    href: '/refunds',
    label: vi.nav.refunds,
    group: 'finance',
    icon: 'refresh-ccw',
    match: 'prefix',
    badgeKey: 'refundNeedsAction',
    permissions: ['refund.request', 'refund.approve', 'refund.execute', 'refund.reconcile'],
  },
  // ĐẠI LÝ
  {
    href: '/agents/overview',
    label: 'Quản lý đại lý',
    group: 'agents',
    icon: 'users',
    match: 'agents-hub',
    badgeKey: 'agentKycPending',
    permission: 'users.read',
  },
  // VẬN HÀNH
  {
    href: '/operations',
    label: vi.nav.operations,
    group: 'ops',
    icon: 'workflow',
    match: 'operations-hub',
    badgeKey: 'opsExceptions',
    permissions: ['reconciliation.read', 'finance.view'],
  },
  {
    href: '/providers',
    label: vi.nav.providers,
    group: 'ops',
    icon: 'truck',
    match: 'prefix',
    permission: 'providers.manage',
  },
  {
    href: '/support/tickets',
    label: vi.nav.supportTickets,
    group: 'ops',
    icon: 'headset',
    match: 'prefix',
    permission: 'support.manage',
  },
  // GIÁM SÁT
  {
    href: '/monitoring',
    label: vi.nav.monitoring,
    group: 'monitoring',
    icon: 'activity',
    match: 'prefix',
    permissions: [
      'activity.read',
      'webhook.read',
      'queue.read',
      'notification.read',
      'monitoring.server.read',
    ],
  },
  // QUẢN TRỊ
  {
    href: '/staff',
    label: vi.nav.staff,
    group: 'admin',
    icon: 'user-cog',
    match: 'exact',
    permission: 'users.manage',
    roles: ['SUPER_ADMIN', 'ADMIN'],
  },
  {
    href: '/configuration',
    label: vi.nav.configuration,
    group: 'admin',
    icon: 'settings',
    match: 'configuration-hub',
    permission: 'configuration.read',
    roles: ['SUPER_ADMIN', 'ADMIN'],
  },
];

/** Role-scoped sidebar: only these href prefixes are visible. */
const ROLE_NAV_ALLOWLIST: Record<string, string[]> = {
  ACCOUNTANT: ['/finance', '/operations', '/orders', '/esim-ops', '/refunds', '/payments', '/agents'],
  MARKETING: ['/marketing'],
  SUPPORT: [
    '/dashboard',
    '/orders',
    '/orders/agent',
    '/esim-ops',
    '/refunds',
    '/payments',
    '/customers',
    '/support',
    '/monitoring',
    '/operations',
    '/agents',
  ],
};

function hrefAllowedForRole(href: string, allowlist: string[]): boolean {
  return allowlist.some((prefix) => href === prefix || href.startsWith(`${prefix}/`));
}

export function canAccessNavItem(
  item: NavItem,
  permissions: string[],
  role: string,
): boolean {
  const allowlist = ROLE_NAV_ALLOWLIST[role];
  if (allowlist && !hrefAllowedForRole(item.href, allowlist)) {
    return false;
  }

  // Explicit role allowlist (e.g. staff/config) applies to every role including SUPER_ADMIN.
  if (item.roles && !item.roles.includes(role)) return false;

  // SUPER_ADMIN sees the full operational menu once role gates pass. Do not let
  // visibleForRoles (used to slim SUPPORT/ACCOUNTANT menus) hide Payments etc.
  if (role === 'SUPER_ADMIN') return true;

  if (item.visibleForRoles && !item.visibleForRoles.includes(role)) {
    return false;
  }

  if (item.permission) return permissions.includes(item.permission);
  if (item.permissions) {
    return item.permissions.some((p) => permissions.includes(p));
  }
  return true;
}

const ORDERS_STATIC_SEGMENTS = new Set(['agent']);

/**
 * Specific child routes win over parent prefix matches.
 * Finance hub = `/finance*` only — never `/refunds` or `/payments`.
 * Dashboard is exact-only — never a fallback active for unmapped routes.
 */
export function isNavItemActive(pathname: string, item: NavItem): boolean {
  const mode = item.match ?? 'prefix';
  switch (mode) {
    case 'exact':
      return pathname === item.href;
    case 'orders-retail': {
      if (pathname === '/orders') return true;
      const m = /^\/orders\/([^/]+)$/.exec(pathname);
      return Boolean(m && !ORDERS_STATIC_SEGMENTS.has(m[1]));
    }
    case 'products':
      return (
        pathname === '/products' ||
        (pathname.startsWith('/products/') && !pathname.startsWith('/products/esim'))
      );
    case 'products-esim':
      return pathname === '/products/esim' || pathname.startsWith('/products/esim/');
    case 'finance-hub':
      return pathname === '/finance' || pathname.startsWith('/finance/');
    case 'agents-hub':
      return pathname === '/agents' || pathname.startsWith('/agents/');
    case 'operations-hub':
      return pathname === '/operations' || pathname.startsWith('/operations/');
    case 'configuration-hub':
      return pathname === '/configuration' || pathname.startsWith('/configuration/');
    case 'prefix':
    default:
      return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }
}

/**
 * At most one active nav href. Prefer longer / more specific matches.
 * Unmapped routes → null (no menu active; no dashboard fallback).
 */
export function resolveActiveNavHref(
  pathname: string,
  items: NavItem[],
): string | null {
  const matches = items.filter((item) => isNavItemActive(pathname, item));
  if (matches.length === 0) return null;
  matches.sort((a, b) => {
    const len = b.href.length - a.href.length;
    if (len !== 0) return len;
    // Prefer non-exact hubs last when lengths equal
    const score = (m: NavMatchMode | undefined) => (m === 'exact' ? 2 : 1);
    return score(b.match) - score(a.match);
  });
  return matches[0].href;
}

/** Accent-insensitive search helper for menu filter. */
export function normalizeNavSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export function hasPermission(
  permissions: string[],
  permission: string,
  role?: string | null,
): boolean {
  if (role === 'SUPER_ADMIN') return true;
  return permissions.includes(permission);
}

export function hasAnyPermission(
  permissions: string[],
  required: string[],
  role?: string | null,
): boolean {
  if (role === 'SUPER_ADMIN') return true;
  return required.some((p) => permissions.includes(p));
}

/** Roles allowed to use admin.cardon.vn (not CUSTOMER / AGENT). */
export const ADMIN_STAFF_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'SUPPORT',
  'ACCOUNTANT',
  'MARKETING',
] as const;

export function isAdminStaffRole(role: string | null | undefined): boolean {
  return Boolean(role && (ADMIN_STAFF_ROLES as readonly string[]).includes(role));
}

/** View payment list — SUPPORT and above with payments.view */
export function canViewPayments(permissions: string[]): boolean {
  return permissions.includes('payments.view');
}

/** Approve/reject manual review — requires payments.review */
export function canReviewPayments(permissions: string[]): boolean {
  return permissions.includes('payments.review');
}

/** Default landing path after login by role. */
export function defaultRouteForRole(role: string, permissions: string[]): string {
  if (role === 'ACCOUNTANT') return '/finance/supplier';
  if (role === 'MARKETING') return '/marketing/articles';
  if (role === 'SUPPORT') return '/orders';
  if (permissions.includes('admin.dashboard')) return '/dashboard';
  if (permissions.includes('orders.read')) return '/orders';
  if (permissions.includes('finance.view')) return '/finance/supplier';
  return '/dashboard';
}
