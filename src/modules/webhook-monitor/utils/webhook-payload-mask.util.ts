import { SECRET_WEBHOOK_KEYS } from '../entities/webhook-monitor.constants';

export function maskWebhookPayload(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[TRUNCATED]';
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => maskWebhookPayload(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (SECRET_WEBHOOK_KEYS.some((s) => lower.includes(s))) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = maskWebhookPayload(val, depth + 1);
      }
    }
    return out;
  }
  return value;
}

export function maskWebhookHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (SECRET_WEBHOOK_KEYS.some((s) => lower.includes(s))) {
      out[key] = '[REDACTED]';
    } else {
      out[key] = val;
    }
  }
  return out;
}

export function payloadByteSize(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value ?? {}), 'utf8');
  } catch {
    return 0;
  }
}
