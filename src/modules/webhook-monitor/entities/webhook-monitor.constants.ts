import { WebhookSource } from '@prisma/client';

export type WebhookMonitorStatus =
  | 'SUCCESS'
  | 'FAILED'
  | 'PENDING'
  | 'RETRY'
  | 'TIMEOUT'
  | 'INVALID_SIGNATURE'
  | 'DUPLICATE'
  | 'IGNORED';

export type WebhookHealth = 'HEALTHY' | 'WARNING' | 'CRITICAL';

export const WEBHOOK_DISPLAY_SOURCES: Record<WebhookSource, string> = {
  MEGAPAY: 'MegaPay',
  SEPAY: 'SePay',
  PROVIDER: 'Provider',
  PARTNER: 'Partner',
  INTERNAL: 'Internal',
};

export const WEBHOOK_ENDPOINTS: Record<WebhookSource, string> = {
  MEGAPAY: '/api/v1/payments/webhook/megapay',
  SEPAY: '/api/v1/payments/webhook/sepay',
  PROVIDER: '/api/v1/provider/callback',
  PARTNER: '/api/v1/partner/callback',
  INTERNAL: '/api/v1/internal/callback',
};

export const WEBHOOK_MONITOR_SOURCES = Object.keys(WEBHOOK_DISPLAY_SOURCES) as WebhookSource[];

export const FAILURE_RATE_WARNING_PCT = 10;
export const TIMEOUT_RATE_WARNING_PCT = 5;
export const NO_WEBHOOK_WARNING_MINUTES = 30;
export const LARGE_PAYLOAD_BYTES = 100_000;

export const SECRET_WEBHOOK_KEYS = [
  'password',
  'secret',
  'apikey',
  'api_key',
  'token',
  'pin',
  'authorization',
  'bearer',
  'signature',
  'webhooksecret',
  'secretkey',
  'access_token',
  'refresh_token',
] as const;
