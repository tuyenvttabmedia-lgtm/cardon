import { QueueName } from '../../../queue/queue.constants';
import { PROVIDER_QUEUE_MAX_ATTEMPTS } from '../../provider/entities/provider-retry.backoff';
import { WEBHOOK_DELIVERY_MAX_ATTEMPTS } from '../../webhook-delivery/entities/webhook-delivery.constants';

export interface QueueReadonlyConfig {
  attempts: number;
  backoff: Record<string, unknown>;
  concurrency: number;
  limiter: Record<string, unknown> | null;
  defaultJobOptions: Record<string, unknown>;
  rateLimit: string | null;
  workerCount: number;
}

const DEFAULT_BACKOFF = { type: 'exponential', delay: 5000 };
const DEFAULT_JOB_OPTIONS = {
  removeOnComplete: 1000,
  removeOnFail: { age: 7 * 24 * 60 * 60, count: 5000 },
  attempts: 3,
  backoff: DEFAULT_BACKOFF,
};

/** Read-only registry — mirrors queue.module.ts without modifying workers. */
export const QUEUE_READONLY_CONFIG: Record<QueueName, QueueReadonlyConfig> = {
  payment_queue: {
    attempts: 3,
    backoff: DEFAULT_BACKOFF,
    concurrency: 0,
    limiter: null,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
    rateLimit: null,
    workerCount: 0,
  },
  provider_queue: {
    attempts: PROVIDER_QUEUE_MAX_ATTEMPTS,
    backoff: { type: 'custom' },
    concurrency: 1,
    limiter: null,
    defaultJobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      attempts: PROVIDER_QUEUE_MAX_ATTEMPTS,
      backoff: { type: 'custom' },
    },
    rateLimit: null,
    workerCount: 1,
  },
  topup_queue: {
    attempts: 3,
    backoff: DEFAULT_BACKOFF,
    concurrency: 1,
    limiter: null,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
    rateLimit: null,
    workerCount: 1,
  },
  email_queue: {
    attempts: 3,
    backoff: DEFAULT_BACKOFF,
    concurrency: 0,
    limiter: null,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
    rateLimit: null,
    workerCount: 0,
  },
  reconciliation_queue: {
    attempts: 3,
    backoff: DEFAULT_BACKOFF,
    concurrency: 0,
    limiter: null,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
    rateLimit: null,
    workerCount: 0,
  },
  notification_queue: {
    attempts: 3,
    backoff: DEFAULT_BACKOFF,
    concurrency: 1,
    limiter: null,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
    rateLimit: null,
    workerCount: 1,
  },
  webhook_delivery_queue: {
    attempts: WEBHOOK_DELIVERY_MAX_ATTEMPTS,
    backoff: { type: 'custom' },
    concurrency: 1,
    limiter: null,
    defaultJobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      attempts: WEBHOOK_DELIVERY_MAX_ATTEMPTS,
      backoff: { type: 'custom' },
    },
    rateLimit: null,
    workerCount: 1,
  },
};
