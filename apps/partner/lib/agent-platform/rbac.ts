import type { AgentPlatformPermission, AgentPlatformRole } from '@/types/platform';

export type { AgentPlatformPermission, AgentPlatformRole };

export const AGENT_PLATFORM_ROLES: AgentPlatformRole[] = [
  'OWNER',
  'MANAGER',
  'FINANCE',
  'OPERATOR',
  'DEVELOPER',
  'READONLY',
];

export const AGENT_ROLE_LABELS: Record<AgentPlatformRole, string> = {
  OWNER: 'Chủ sở hữu',
  MANAGER: 'Quản lý',
  FINANCE: 'Tài chính',
  OPERATOR: 'Vận hành',
  DEVELOPER: 'Developer',
  READONLY: 'Chỉ xem',
};

export const AGENT_ROLE_PERMISSIONS: Record<AgentPlatformRole, AgentPlatformPermission[]> = {
  OWNER: [
    'dashboard.read', 'wallet.read', 'wallet.export', 'finance.read', 'finance.export',
    'orders.read', 'orders.export', 'products.read', 'settlement.read', 'reports.read',
    'api.read', 'api.manage', 'webhooks.read', 'webhooks.manage', 'invoices.read',
    'users.read', 'users.manage', 'support.read', 'settings.read', 'settings.manage',
    'notifications.read', 'organization.read', 'organization.manage', 'sessions.read', 'sessions.manage', 'retry.manage',
  ],
  MANAGER: [
    'dashboard.read', 'orders.read', 'orders.export', 'products.read', 'settlement.read',
    'reports.read', 'invoices.read', 'users.read', 'api.read', 'webhooks.read',
    'notifications.read', 'settings.read', 'organization.read', 'retry.manage',
  ],
  FINANCE: [
    'dashboard.read', 'wallet.read', 'wallet.export', 'finance.read', 'finance.export',
    'orders.read', 'settlement.read', 'reports.read', 'invoices.read',
    'notifications.read', 'settings.read', 'organization.read',
  ],
  OPERATOR: [
    'dashboard.read', 'orders.read', 'orders.export', 'products.read', 'webhooks.read',
    'support.read', 'notifications.read', 'settings.read', 'organization.read', 'retry.manage',
  ],
  DEVELOPER: [
    'dashboard.read', 'api.read', 'api.manage', 'webhooks.read', 'webhooks.manage',
    'notifications.read', 'settings.read', 'organization.read', 'retry.manage',
  ],
  READONLY: [
    'dashboard.read', 'wallet.read', 'finance.read', 'orders.read', 'products.read',
    'settlement.read', 'reports.read', 'api.read', 'webhooks.read', 'invoices.read',
    'users.read', 'support.read', 'settings.read', 'notifications.read', 'organization.read', 'sessions.read',
  ],
};

export function canAccess(role: AgentPlatformRole, permission: AgentPlatformPermission): boolean {
  return AGENT_ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
