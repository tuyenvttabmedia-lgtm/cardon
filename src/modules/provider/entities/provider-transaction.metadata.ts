import { ProviderTransactionAction, ProviderTransactionStatus } from '@prisma/client';

/** Non-secret metadata persisted on provider_transactions.provider_metadata */
export interface ProviderTransactionMetadata {
  requestTime?: string;
  kind?: 'CARD' | 'TOPUP';
  providerCode?: string;
}

export function parseProviderTransactionMetadata(
  value: unknown,
): ProviderTransactionMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const record = value as Record<string, unknown>;
  const kind = record.kind;
  return {
    requestTime:
      typeof record.requestTime === 'string' ? record.requestTime : undefined,
    kind: kind === 'CARD' || kind === 'TOPUP' ? kind : undefined,
    providerCode:
      typeof record.providerCode === 'string' ? record.providerCode : undefined,
  };
}

export function buildCardProviderMetadata(
  requestTime: string,
): ProviderTransactionMetadata {
  return {
    requestTime,
    kind: 'CARD',
    providerCode: 'ESALE',
  };
}

export function buildTopupProviderMetadata(
  requestTime: string,
  phoneNumber: string,
  telco?: string,
): ProviderTransactionMetadata & { phoneNumber?: string; telco?: string } {
  return {
    requestTime,
    kind: 'TOPUP',
    providerCode: 'ESALE',
    phoneNumber,
    telco,
  };
}

export const RECOVERABLE_PROVIDER_STATUSES: ProviderTransactionStatus[] = [
  ProviderTransactionStatus.PROCESSING,
  ProviderTransactionStatus.SUCCESS,
  ProviderTransactionStatus.TIMEOUT,
  ProviderTransactionStatus.PENDING,
];
