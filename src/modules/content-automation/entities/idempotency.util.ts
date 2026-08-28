import { AiTaskType } from '@prisma/client';

/**
 * Frozen idempotency contract (Master Spec v1.0 §15).
 * Canonical key: {planId}:{task}:{generationEpoch}
 * BullMQ jobId: content-{planId}-{task}-{generationEpoch}
 */
export function buildIdempotencyKey(
  planId: string,
  task: AiTaskType,
  generationEpoch: number,
): string {
  return `${planId}:${task}:${generationEpoch}`;
}

export function buildBullMqJobId(
  planId: string,
  task: AiTaskType,
  generationEpoch: number,
): string {
  return `content-${planId}-${task}-${generationEpoch}`;
}
