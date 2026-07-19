import { SystemAuditAction, SystemAuditResource } from '@prisma/client';

export { SystemAuditAction, SystemAuditResource };

export enum AuditSnapshotKey {
  PAYMENT_MEGAPAY = 'payment_megapay',
  PAYMENT_SEPAY = 'payment_sepay',
  PAYMENT_METHODS = 'payment_methods',
  PAYMENT_RUNTIME = 'payment_runtime',
  PAYMENT_STRATEGY = 'payment_strategy',
  PAYMENT_GATEWAY_RUNTIME = 'payment_gateway_runtime',
  PROVIDER_ESALE = 'provider_esale',
  SMTP = 'smtp',
  SYSTEM = 'system',
  ORDER = 'order',
  TELEGRAM = 'telegram',
  PROVIDER_RUNTIME = 'provider_runtime',
  CMS_SEO = 'cms_seo',
}

export const AUDIT_METADATA_KEY = 'audit_metadata';

export const SECRET_FIELD_PATTERNS = [
  'password',
  'secret',
  'api_key',
  'apikey',
  'client_secret',
  'smtp_password',
  'private_key',
  'refresh_token',
  'access_token',
  'authorization',
  'bearer',
  'secretkey',
  'webhooksecret',
  'bottoken',
] as const;

export const MAX_AUDIT_JSON_BYTES = 50 * 1024;

export const AUDIT_EXCLUDED_PATH_PREFIXES = [
  '/health',
  '/admin/audit',
  '/admin/audit-logs',
] as const;
