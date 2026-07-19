import { SECRET_PAYLOAD_KEYS } from '../entities/queue-monitor.constants';

export function maskQueuePayload(value: unknown, depth = 0): unknown {
  if (depth > 8) {
    return '[TRUNCATED]';
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => maskQueuePayload(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (SECRET_PAYLOAD_KEYS.some((s) => lower.includes(s))) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = maskQueuePayload(val, depth + 1);
      }
    }
    return out;
  }
  return value;
}
