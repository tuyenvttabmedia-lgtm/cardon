import { QueueName } from '../../../queue/queue.constants';

export const QUEUE_DISPLAY_NAMES: Record<QueueName, string> = {
  payment_queue: 'Payment',
  provider_queue: 'Provider',
  topup_queue: 'Topup',
  email_queue: 'Email',
  reconciliation_queue: 'Reconciliation',
  notification_queue: 'Notification',
  webhook_delivery_queue: 'Webhook Delivery',
};

export const QUEUE_FAILED_ALERT_THRESHOLD = 10;

export const QUEUE_MONITOR_REFRESH_SEC = 10;

export const JOB_LIST_PAGE_SIZE_DEFAULT = 20;
export const JOB_LIST_PAGE_SIZE_MAX = 100;

export const SECRET_PAYLOAD_KEYS = [
  'password',
  'secret',
  'apikey',
  'api_key',
  'token',
  'pin',
  'serial',
  'authorization',
  'bearer',
  'webhooksecret',
  'bottoken',
  'smtp_password',
  'secretkey',
  'private_key',
  'refresh_token',
  'access_token',
] as const;

export type BullJobStatus =
  | 'waiting'
  | 'active'
  | 'delayed'
  | 'completed'
  | 'failed'
  | 'paused';

export const JOB_STATUS_LIST: BullJobStatus[] = [
  'waiting',
  'active',
  'delayed',
  'completed',
  'failed',
  'paused',
];
