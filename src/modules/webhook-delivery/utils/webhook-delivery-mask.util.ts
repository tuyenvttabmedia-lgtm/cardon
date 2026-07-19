import { SECRET_WEBHOOK_KEYS } from '../../webhook-monitor/entities/webhook-monitor.constants';

export function maskDeliveryPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const clone = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
  for (const key of Object.keys(clone)) {
    if (SECRET_WEBHOOK_KEYS.some((s) => key.toLowerCase().includes(s))) {
      clone[key] = '********';
    }
  }
  if (typeof clone.pin === 'string' && clone.pin.length > 4) {
    clone.pin = `${clone.pin.slice(0, 2)}${'*'.repeat(Math.max(0, clone.pin.length - 4))}${clone.pin.slice(-2)}`;
  }
  return clone;
}

export function truncateBody(body: string | null | undefined, max = 4096): string | null {
  if (!body) return null;
  if (body.length <= max) return body;
  return `${body.slice(0, max)}…[truncated]`;
}
