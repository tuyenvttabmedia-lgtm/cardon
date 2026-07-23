/** BullMQ retry delays for provider_queue pending/timeout recovery (ms). */
export const PROVIDER_RETRY_DELAYS_MS = [30_000, 60_000, 300_000, 900_000] as const;

export const PROVIDER_QUEUE_MAX_ATTEMPTS = PROVIDER_RETRY_DELAYS_MS.length + 1;

/**
 * eSale topup: do not call checkTransaction until the topup attempt is at least 5 minutes old
 * (avoids check arriving before the topup is visible on their side).
 */
export const TOPUP_CHECK_MIN_DELAY_MS = 5 * 60_000;

/** Delayed checkTransaction rounds for topup_queue (first delay ≥ 5 minutes). */
export const TOPUP_CHECK_RETRY_DELAYS_MS = [
  TOPUP_CHECK_MIN_DELAY_MS,
  10 * 60_000,
  15 * 60_000,
  30 * 60_000,
] as const;

export function providerQueueBackoffDelay(attemptsMade: number): number {
  const index = Math.max(0, attemptsMade - 1);
  return PROVIDER_RETRY_DELAYS_MS[Math.min(index, PROVIDER_RETRY_DELAYS_MS.length - 1)];
}

export function topupCheckBackoffDelay(round: number): number {
  const index = Math.max(0, round - 1);
  return TOPUP_CHECK_RETRY_DELAYS_MS[
    Math.min(index, TOPUP_CHECK_RETRY_DELAYS_MS.length - 1)
  ];
}

export function msUntilTopupCheckAllowed(createdAt: Date, nowMs = Date.now()): number {
  const elapsed = nowMs - createdAt.getTime();
  return Math.max(0, TOPUP_CHECK_MIN_DELAY_MS - elapsed);
}
