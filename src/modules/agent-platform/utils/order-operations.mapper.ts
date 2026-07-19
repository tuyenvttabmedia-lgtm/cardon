import { FulfillmentStatus } from '@prisma/client';

export type PortalOrderStatus = 'SUCCESS' | 'PROCESSING' | 'FAILED' | 'REFUND';

export function maskSecret(value: string | null | undefined, visible = 4): string | null {
  if (!value) return null;
  if (value.length <= visible) return '•'.repeat(value.length);
  return `${'•'.repeat(Math.min(8, value.length - visible))}${value.slice(-visible)}`;
}

export function maskIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const parts = ip.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.•••.${parts[3]}`;
  if (ip.includes(':')) return `${ip.slice(0, 6)}•••`;
  return maskSecret(ip, 3);
}

export function maskJsonPayload(payload: unknown, sensitiveKeys: string[] = []): unknown {
  if (payload === null || payload === undefined) return payload;
  const keys = new Set([
    'pin',
    'card_pin',
    'cardPin',
    'secret',
    'secretKey',
    'apiKey',
    'api_key',
    'token',
    'authorization',
    'signature',
    'webhookSecret',
    ...sensitiveKeys,
  ]);

  if (Array.isArray(payload)) {
    return payload.map((item) => maskJsonPayload(item, sensitiveKeys));
  }

  if (typeof payload === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(payload as Record<string, unknown>)) {
      if (keys.has(key) || keys.has(key.toLowerCase())) {
        out[key] = typeof val === 'string' ? maskSecret(val) : '••••••••';
      } else {
        out[key] = maskJsonPayload(val, sensitiveKeys);
      }
    }
    return out;
  }

  return payload;
}

export function mapFulfillmentToPortalStatus(status: FulfillmentStatus): PortalOrderStatus {
  if (status === FulfillmentStatus.COMPLETED) return 'SUCCESS';
  if (status === FulfillmentStatus.FAILED) return 'FAILED';
  return 'PROCESSING';
}

export function computeLatencyMs(createdAt: Date, completedAt: Date | null | undefined): number | null {
  if (!completedAt) return null;
  return Math.max(0, completedAt.getTime() - createdAt.getTime());
}

export function resolveGateway(order: { paymentGateway: string | null; channel: string }): string {
  if (order.paymentGateway) return order.paymentGateway;
  if (order.channel === 'AGENT') return 'WALLET';
  return 'UNKNOWN';
}
