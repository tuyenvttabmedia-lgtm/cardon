import { CMS_PERMISSION } from '../../cms/entities/cms.constants';

export const CONTENT_AUTOMATION_PERMISSION = CMS_PERMISSION;

export const CONTENT_AUTOMATION_QUEUE = 'content_automation_queue' as const;

export const CONTENT_AUTOMATION_JOB = {
  PING: 'PING',
  ANALYZE: 'ANALYZE',
  GENERATE_OUTLINE: 'GENERATE_OUTLINE',
  GENERATE_ARTICLE: 'GENERATE_ARTICLE',
  REGENERATE_SECTION: 'REGENERATE_SECTION',
  QUALITY_CHECK: 'QUALITY_CHECK',
} as const;

export type ContentAutomationJobName =
  (typeof CONTENT_AUTOMATION_JOB)[keyof typeof CONTENT_AUTOMATION_JOB];

/** Job attempts / cleanup — applied at queue.add time. */
export const CONTENT_AUTOMATION_QUEUE_OPTIONS = {
  attempts: 2,
  backoff: { type: 'exponential' as const, delay: 10_000 },
  removeOnComplete: 500,
  removeOnFail: { age: 7 * 24 * 60 * 60, count: 2000 },
};

/** Soft wall-clock for AI work (must stay under lockDuration). */
export const CONTENT_AUTOMATION_JOB_TIMEOUT_MS = 180_000;

/**
 * BullMQ worker lock — must exceed longest AI call (default provider timeout 170s)
 * so jobs are not stalled/retried while still running.
 */
export const CONTENT_AUTOMATION_LOCK_DURATION_MS = 190_000;

/** Spec §19 — max AI jobs enqueued per plan per rolling hour. */
export const CONTENT_AUTOMATION_RATE_LIMIT_PER_HOUR = 10;

export const CONTENT_AUTOMATION_SOURCE_TYPE_MANUAL = 'MANUAL';

export const CONTENT_PLAN_PRIORITY = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
} as const;
