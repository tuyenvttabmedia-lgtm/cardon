export const QUEUE_NAMES = [
  'payment_queue',
  'provider_queue',
  'topup_queue',
  'email_queue',
  'reconciliation_queue',
  'notification_queue',
  'webhook_delivery_queue',
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

export const QUEUE_TOKENS = Object.fromEntries(
  QUEUE_NAMES.map((name) => [name, name]),
) as Record<QueueName, QueueName>;
