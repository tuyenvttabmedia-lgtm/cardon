import { SystemAuditResource } from '@prisma/client';

export type ConfigurationModuleId =
  | 'payment'
  | 'providers'
  | 'orders'
  | 'smtp'
  | 'telegram'
  | 'webhooks'
  | 'security'
  | 'integrations'
  | 'feature-flags'
  | 'maintenance'
  | 'backup'
  | 'system'
  | 'audit'
  | 'advanced'
  | 'health';

export type ConfigurationModuleStatus =
  | 'configured'
  | 'needs_attention'
  | 'disabled'
  | 'production_ready'
  | 'warning';

export interface ConfigurationSearchEntry {
  id: string;
  module: ConfigurationModuleId;
  label: string;
  keywords: string[];
  href: string;
  permission?: string;
}

export const CONFIGURATION_SEARCH_INDEX: ConfigurationSearchEntry[] = [
  { id: 'smtp', module: 'smtp', label: 'SMTP', keywords: ['smtp', 'email', 'mail', 'port'], href: '/configuration/smtp' },
  { id: 'megapay', module: 'payment', label: 'MegaPay', keywords: ['megapay', 'payment', 'gateway'], href: '/configuration/payment' },
  { id: 'sepay', module: 'payment', label: 'SePay', keywords: ['sepay', 'payment', 'vietqr'], href: '/configuration/payment' },
  { id: 'order-limit', module: 'orders', label: 'Order Limit', keywords: ['order', 'limit', 'timeout', 'đơn hàng'], href: '/configuration/orders' },
  { id: 'telegram', module: 'telegram', label: 'Telegram', keywords: ['telegram', 'bot', 'notification'], href: '/configuration/telegram' },
  { id: 'webhook', module: 'webhooks', label: 'Webhook URLs', keywords: ['webhook', 'callback', 'signature'], href: '/configuration/webhooks' },
  { id: 'provider-esale', module: 'providers', label: 'Provider eSale', keywords: ['provider', 'esale', 'card'], href: '/configuration/providers' },
  { id: 'feature-flags', module: 'feature-flags', label: 'Feature Flags', keywords: ['feature', 'flag', 'topup', 'registration'], href: '/configuration/system' },
  { id: 'maintenance', module: 'maintenance', label: 'Maintenance Mode', keywords: ['maintenance', 'offline'], href: '/configuration/maintenance' },
  { id: 'backup', module: 'backup', label: 'Backup & Export', keywords: ['backup', 'export', 'import', 'json'], href: '/configuration/backup' },
  { id: 'system', module: 'system', label: 'System', keywords: ['system', 'site', 'url'], href: '/configuration/system' },
  { id: 'audit', module: 'audit', label: 'Audit Log', keywords: ['audit', 'history', 'changes'], href: '/configuration/audit' },
  { id: 'security', module: 'security', label: 'Security', keywords: ['security', 'secret', 'encryption'], href: '/configuration/system' },
];

export const MODULE_AUDIT_RESOURCE: Partial<Record<ConfigurationModuleId, SystemAuditResource>> = {
  payment: SystemAuditResource.PAYMENT_GATEWAY,
  providers: SystemAuditResource.PROVIDER,
  smtp: SystemAuditResource.SMTP,
  system: SystemAuditResource.FEATURE_FLAG,
  orders: SystemAuditResource.SETTING,
  telegram: SystemAuditResource.SETTING,
  maintenance: SystemAuditResource.SETTING,
};

export const EXPORTABLE_MODULES = [
  'payment',
  'smtp',
  'telegram',
  'providers',
  'feature-flags',
  'system',
  'orders',
] as const;

export type ExportableModule = (typeof EXPORTABLE_MODULES)[number];
