import { vi } from '@/lib/i18n/vi';



export interface NavItem {

  href: string;

  label: string;

  permission?: string;

  permissions?: string[];

  roles?: string[];

  /** When set, only these roles see this item (in addition to permission checks). */

  visibleForRoles?: string[];

}



/** Sidebar items shown to SUPER_ADMIN / ADMIN (default full menu). */

export const NAV_ITEMS: NavItem[] = [

  { href: '/dashboard', label: vi.nav.dashboard, permission: 'admin.dashboard' },

  { href: '/orders', label: vi.nav.orders, permission: 'orders.read' },

  { href: '/products', label: vi.nav.products, permission: 'products.manage' },

  { href: '/providers', label: vi.nav.providers, permission: 'providers.manage' },

  { href: '/customers', label: vi.nav.customers, permission: 'customers.read' },

  { href: '/marketing', label: vi.nav.marketing, permission: 'cms.manage' },

  {
    href: '/support/tickets',
    label: vi.nav.supportTickets,
    permission: 'support.manage',
  },

  { href: '/finance/dashboard', label: vi.nav.finance, permission: 'finance.view' },

  {
    href: '/operations',
    label: vi.nav.operations,
    permissions: ['reconciliation.read', 'finance.view'],
  },

  {
    href: '/monitoring',
    label: vi.nav.monitoring,
    permissions: ['activity.read', 'webhook.read', 'queue.read', 'notification.read'],
  },

  { href: '/agents/overview', label: vi.nav.agents, permission: 'users.read' },

  {
    href: '/staff',
    label: vi.nav.staff,
    permission: 'users.manage',
    roles: ['SUPER_ADMIN', 'ADMIN'],
  },

  {

    href: '/payments',

    label: vi.nav.payments,

    permission: 'payments.view',

    visibleForRoles: ['SUPPORT'],

  },

  {

    href: '/configuration',

    label: vi.nav.configuration,

    permission: 'configuration.read',

    roles: ['SUPER_ADMIN', 'ADMIN'],

  },

];



/** Role-scoped sidebar: only these href prefixes are visible. */

const ROLE_NAV_ALLOWLIST: Record<string, string[]> = {

  ACCOUNTANT: ['/finance', '/operations'],

  MARKETING: ['/marketing'],

  SUPPORT: ['/dashboard', '/orders', '/payments', '/customers', '/support', '/monitoring', '/operations', '/agents'],

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



  if (item.visibleForRoles && !item.visibleForRoles.includes(role)) {

    return false;

  }



  if (item.roles && !item.roles.includes(role)) return false;

  if (item.permission) return permissions.includes(item.permission);

  if (item.permissions) {

    return item.permissions.some((p) => permissions.includes(p));

  }

  return true;

}



export function hasPermission(permissions: string[], permission: string): boolean {

  return permissions.includes(permission);

}



export function hasAnyPermission(permissions: string[], required: string[]): boolean {

  return required.some((p) => permissions.includes(p));

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

  if (role === 'ACCOUNTANT') return '/finance/dashboard';

  if (role === 'MARKETING') return '/marketing/articles';

  if (role === 'SUPPORT') return '/orders';

  if (permissions.includes('admin.dashboard')) return '/dashboard';

  if (permissions.includes('orders.read')) return '/orders';

  if (permissions.includes('finance.view')) return '/finance/dashboard';

  return '/dashboard';

}

