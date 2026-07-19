import {
  ProviderTransaction,
  ProviderTransactionAction,
  ProviderTransactionStatus,
} from '@prisma/client';

const SENSITIVE_KEY = /secret|password|apikey|api_key|authorization|token|pin|serial/i;

export function sanitizeProviderPayload(payload: unknown): unknown {
  if (payload === null || payload === undefined) {
    return payload;
  }
  if (Array.isArray(payload)) {
    return payload.map(sanitizeProviderPayload);
  }
  if (typeof payload === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitizeProviderPayload(value);
    }
    return out;
  }
  return payload;
}

export interface AdminProviderTransactionView {
  id: string;
  orderId: string;
  providerId: string;
  requestId: string;
  attempt: number;
  action: ProviderTransactionAction;
  status: ProviderTransactionStatus;
  providerTransactionId: string | null;
  providerReference: string | null;
  createdAt: string;
  updatedAt: string;
  requestPayload: unknown;
  responsePayload: unknown;
}

export function mapAdminProviderTransaction(
  row: ProviderTransaction,
): AdminProviderTransactionView {
  return {
    id: row.id,
    orderId: row.orderId,
    providerId: row.providerId,
    requestId: row.requestId,
    attempt: row.attempt,
    action: row.action,
    status: row.status,
    providerTransactionId: row.providerTransactionId,
    providerReference: row.providerReference,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    requestPayload: sanitizeProviderPayload(row.requestPayload),
    responsePayload: sanitizeProviderPayload(row.responsePayload),
  };
}
