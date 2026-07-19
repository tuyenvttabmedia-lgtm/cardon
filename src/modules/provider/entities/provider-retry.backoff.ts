/** BullMQ retry delays for provider_queue pending/timeout recovery (ms). */
export const PROVIDER_RETRY_DELAYS_MS = [30_000, 60_000, 300_000, 900_000] as const;

export const PROVIDER_QUEUE_MAX_ATTEMPTS = PROVIDER_RETRY_DELAYS_MS.length + 1;

export function providerQueueBackoffDelay(attemptsMade: number): number {
  const index = Math.max(0, attemptsMade - 1);
  return PROVIDER_RETRY_DELAYS_MS[Math.min(index, PROVIDER_RETRY_DELAYS_MS.length - 1)];
}
