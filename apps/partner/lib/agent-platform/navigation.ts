import type { AgentPlatformPermission } from '@/types/platform';
import { PARTNER_TEAM_NAV_ENABLED } from '@/lib/onboarding-gate';

export interface AgentNavItem {
  href: string;
  label: string;
  permission: AgentPlatformPermission;
  exact?: boolean;
  children?: Array<{ href: string; label: string; permission: AgentPlatformPermission; exact?: boolean }>;
}

/**
 * Frozen B2B Partner navigation — Build 6033.4.1
 * API-first: no ERP, settlement, products, or manual purchase in sidebar.
 */
export const AGENT_PLATFORM_NAV: AgentNavItem[] = [
  { href: '/dashboard', label: 'Bảng điều khiển', permission: 'dashboard.read', exact: true },
  {
    href: '/wallet',
    label: 'Ví',
    permission: 'wallet.read',
    children: [
      { href: '/wallet', label: 'Tổng quan', permission: 'wallet.read', exact: true },
      { href: '/finance/deposits', label: 'Nạp tiền', permission: 'finance.read' },
      { href: '/finance/settlements', label: 'Đối soát', permission: 'settlement.read' },
      { href: '/wallet/deposit-history', label: 'Lịch sử nạp', permission: 'wallet.read' },
      { href: '/wallet/ledger', label: 'Sổ quỹ', permission: 'wallet.read' },
    ],
  },
  {
    href: '/orders/search',
    label: 'Đơn hàng API',
    permission: 'orders.read',
    children: [
      { href: '/orders/search', label: 'Tra cứu', permission: 'orders.read', exact: true },
      { href: '/orders/history', label: 'Lịch sử', permission: 'orders.read' },
      { href: '/orders/timeline', label: 'Timeline', permission: 'orders.read' },
    ],
  },
  {
    href: '/api/keys',
    label: 'API Center',
    permission: 'api.read',
    children: [
      { href: '/api/keys', label: 'Khóa API', permission: 'api.read', exact: true },
      { href: '/api/ip-whitelist', label: 'IP Whitelist', permission: 'api.read' },
      { href: '/api/webhook', label: 'Webhook', permission: 'webhooks.read' },
      { href: '/api/rate-limit', label: 'Rate Limit', permission: 'api.read' },
      { href: '/api/security', label: 'Bảo mật', permission: 'api.read' },
      { href: '/api/logs', label: 'Nhật ký API', permission: 'api.read' },
      { href: '/api/docs', label: 'Tài liệu API', permission: 'api.read' },
      { href: '/api/sdk', label: 'SDK', permission: 'api.read' },
      { href: '/api/test', label: 'Thử API', permission: 'api.read' },
      { href: '/api/usage', label: 'Sử dụng API', permission: 'api.read' },
    ],
  },
  { href: '/reports', label: 'Báo cáo', permission: 'reports.read' },
  { href: '/invoices', label: 'Hóa đơn', permission: 'invoices.read' },
  { href: '/notifications', label: 'Thông báo', permission: 'notifications.read' },
  {
    href: '/account',
    label: 'Tài khoản',
    permission: 'settings.read',
    children: [
      { href: '/account', label: 'Hồ sơ', permission: 'settings.read', exact: true },
      { href: '/account#doi-mat-khau', label: 'Đổi mật khẩu', permission: 'settings.read' },
      { href: '/account/kyc', label: 'Xác minh KYC', permission: 'settings.read' },
      { href: '/account/organization', label: 'Tổ chức', permission: 'organization.read' },
      { href: '/users', label: 'Người dùng', permission: 'users.read' },
      { href: '/account/roles', label: 'Vai trò & quyền', permission: 'organization.read' },
      { href: '/account/sessions', label: 'Phiên đăng nhập', permission: 'sessions.read' },
      { href: '/account/login-history', label: 'Lịch sử đăng nhập', permission: 'sessions.read' },
    ],
  },
];

const TEAM_NAV_HREFS = new Set([
  '/account/organization',
  '/users',
  '/account/roles',
]);

/** Minimal nav shown while email/KYC onboarding is incomplete. */
export const AGENT_ONBOARDING_NAV: AgentNavItem[] = [
  { href: '/account/kyc', label: 'Trung tâm KYC', permission: 'settings.read', exact: true },
  { href: '/api/docs', label: 'Tài liệu API', permission: 'api.read' },
  { href: '/notifications', label: 'Thông báo', permission: 'notifications.read' },
];

export function filterPlatformNavItems(items: AgentNavItem[]): AgentNavItem[] {
  if (PARTNER_TEAM_NAV_ENABLED) return items;

  return items
    .filter((item) => item.href !== '/users')
    .map((item) => {
      if (!item.children?.length) return item;
      return {
        ...item,
        children: item.children.filter((child) => !TEAM_NAV_HREFS.has(child.href)),
      };
    });
}

/** Hidden ERP routes — redirect to coming-soon (compatibility only). */
export const PARTNER_HIDDEN_ERP_PREFIXES = [
  '/products',
  '/support',
  '/finance/adjustments',
  '/finance/credit',
  '/finance/withdraws',
  '/finance/history',
  '/wallet/withdraws',
  '/wallet/limits',
  '/wallet/deposits',
  '/wallet/transactions',
] as const;
