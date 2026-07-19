export const WEBHOOK_DELIVERY_QUEUE = 'webhook_delivery_queue';

export const WEBHOOK_DELIVERY_JOB = {
  SEND: 'webhook.delivery.send',
} as const;

export const WEBHOOK_EVENT_VERSION = 'v1';

export const WEBHOOK_EVENTS = {
  ORDER_COMPLETED: 'order.completed',
  ORDER_FAILED: 'order.failed',
} as const;

export type WebhookEventType = (typeof WEBHOOK_EVENTS)[keyof typeof WEBHOOK_EVENTS];

export const WEBHOOK_DELIVERY_STATUS = {
  PENDING: 'Pending',
  SENDING: 'Sending',
  DELIVERED: 'Delivered',
  RETRYING: 'Retrying',
  FAILED: 'Failed',
  DEAD_LETTER: 'DeadLetter',
  CANCELLED: 'Cancelled',
} as const;

export type WebhookDeliveryStatus =
  (typeof WEBHOOK_DELIVERY_STATUS)[keyof typeof WEBHOOK_DELIVERY_STATUS];

/** Retry: immediate, 1m, 5m, 15m, 30m (5 attempts total) */
export const WEBHOOK_RETRY_DELAYS_MS = [0, 60_000, 300_000, 900_000, 1_800_000] as const;

export const WEBHOOK_DELIVERY_MAX_ATTEMPTS = WEBHOOK_RETRY_DELAYS_MS.length;

export function webhookDeliveryBackoffDelay(attemptsMade: number): number {
  const index = Math.max(0, attemptsMade - 1);
  return WEBHOOK_RETRY_DELAYS_MS[Math.min(index, WEBHOOK_RETRY_DELAYS_MS.length - 1)];
}

export const WEBHOOK_HTTP_TIMEOUT_MS = 5_000;
export const WEBHOOK_MAX_PAYLOAD_BYTES = 256 * 1024;

export const WEBHOOK_HEADERS = {
  SIGNATURE: 'X-CardOn-Signature',
  TIMESTAMP: 'X-CardOn-Timestamp',
  EVENT: 'X-CardOn-Event',
  VERSION: 'X-CardOn-Version',
} as const;

export const WEBHOOK_BLOCKED_HOST_SUFFIXES = [
  'cardon.vn',
  'cardon.local',
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
];
