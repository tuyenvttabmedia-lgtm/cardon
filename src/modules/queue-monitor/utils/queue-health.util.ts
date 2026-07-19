export type QueueHealth = 'HEALTHY' | 'WARNING' | 'CRITICAL';

export const DELAYED_WARNING_THRESHOLD = 25;
export const RETRY_WARNING_THRESHOLD = 15;
export const FAILED_RATE_WARNING_PCT = 5;
export const FAILED_RATE_CRITICAL_PCT = 20;
export const WORKER_HEARTBEAT_ALERT_MS = 60_000;

export interface QueueHealthInput {
  isPaused: boolean;
  redisOk: boolean;
  workerOnline: boolean;
  failed: number;
  completed: number;
  delayed: number;
  retryCount: number;
}

export function computeQueueHealth(input: QueueHealthInput): QueueHealth {
  const total = input.failed + input.completed;
  const failedPct = total > 0 ? (input.failed / total) * 100 : 0;

  if (
    input.isPaused ||
    !input.workerOnline ||
    !input.redisOk ||
    failedPct > FAILED_RATE_CRITICAL_PCT
  ) {
    return 'CRITICAL';
  }

  if (
    failedPct >= FAILED_RATE_WARNING_PCT ||
    input.delayed >= DELAYED_WARNING_THRESHOLD ||
    input.retryCount >= RETRY_WARNING_THRESHOLD
  ) {
    return 'WARNING';
  }

  return 'HEALTHY';
}

export function percentile(values: number[], pct: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((pct / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}
