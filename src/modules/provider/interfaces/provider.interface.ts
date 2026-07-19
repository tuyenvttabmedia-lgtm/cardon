import { ProviderTransactionStatus } from '@prisma/client';

export type ProviderFailureCode =
  | 'OUT_OF_STOCK'
  | 'LOW_BALANCE'
  | 'MAINTENANCE'
  | 'TIMEOUT'
  | 'UNKNOWN'
  | 'INVALID_SKU';

export interface ProviderCheckContext {
  providerTransactionDate: string;
  providerRequestTime?: string;
  kind?: 'CARD' | 'TOPUP';
}

export interface BuyCardParams {
  requestId: string;
  providerProductCode: string;
  quantity: number;
  orderId: string;
  providerTransactionDate?: string;
  providerRequestTime?: string;
}

export interface TopupParams {
  requestId: string;
  providerProductCode: string;
  phoneNumber: string;
  amount: number;
  orderId: string;
  packageCode?: string;
  supplierCode?: string;
  cardId?: number;
  providerTransactionDate?: string;
  providerRequestTime?: string;
}

export interface ProviderCardItem {
  serial: string;
  pin: string;
  expiredAt?: Date;
}

export interface ProviderResult {
  success: boolean;
  status: ProviderTransactionStatus;
  providerTransactionId?: string;
  providerReference?: string;
  cards?: ProviderCardItem[];
  failureCode?: ProviderFailureCode;
  message?: string;
  rawResponse?: Record<string, unknown>;
}

export interface BalanceResult {
  balance: number;
  currency: string;
}

export interface ProductSyncResult {
  synced: number;
  newCount?: number;
  updatedCount?: number;
  disabledCount?: number;
  message?: string;
}

export interface ProviderInterface {
  readonly code: string;

  buyCard(params: BuyCardParams): Promise<ProviderResult>;
  topup(params: TopupParams): Promise<ProviderResult>;
  checkTransaction(
    requestId: string,
    context?: ProviderCheckContext,
  ): Promise<ProviderResult>;
  getBalance(): Promise<BalanceResult>;
  syncProducts(): Promise<ProductSyncResult>;
}
