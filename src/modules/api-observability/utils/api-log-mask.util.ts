import { SECRET_WEBHOOK_KEYS } from '../../webhook-monitor/entities/webhook-monitor.constants';
import { API_SENSITIVE_HEADER_KEYS } from '../entities/api-observability.constants';

export function maskApiKey(apiKey: string | null | undefined): string | null {
  if (!apiKey) return null;
  if (apiKey.length <= 8) return '••••••••';
  return `${apiKey.slice(0, 4)}${'•'.repeat(12)}${apiKey.slice(-4)}`;
}

export function maskHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (API_SENSITIVE_HEADER_KEYS.some((k: string) => lower.includes(k))) {
      out[key] = maskApiKey(value) ?? '********';
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function maskApiPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const clone = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
  for (const key of Object.keys(clone)) {
    const lower = key.toLowerCase();
    if (
      SECRET_WEBHOOK_KEYS.some((s) => lower.includes(s)) ||
      lower.includes('pin') ||
      lower.includes('serial') ||
      lower.includes('secret') ||
      lower.includes('token')
    ) {
      if (lower.includes('pin') && typeof clone[key] === 'string') {
        const pin = clone[key] as string;
        clone[key] =
          pin.length > 4
            ? `${pin.slice(0, 2)}${'*'.repeat(Math.max(0, pin.length - 4))}${pin.slice(-2)}`
            : '****';
      } else {
        clone[key] = '********';
      }
    }
    if (Array.isArray(clone[key])) {
      clone[key] = (clone[key] as unknown[]).map((item) => maskApiPayload(item));
    } else if (clone[key] && typeof clone[key] === 'object') {
      clone[key] = maskApiPayload(clone[key]);
    }
  }
  return clone;
}

export function truncateJson(value: unknown, maxBytes = 32_768): unknown {
  const raw = JSON.stringify(value);
  if (raw.length <= maxBytes) return value;
  return { truncated: true, preview: `${raw.slice(0, maxBytes)}…` };
}
