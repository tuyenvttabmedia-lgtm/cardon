import { Injectable } from '@nestjs/common';
import { ProviderTransactionStatus } from '@prisma/client';
import { PROVIDER_CODES } from '../entities/provider.constants';
import {
  BalanceResult,
  BuyCardParams,
  ProductSyncResult,
  ProviderInterface,
  ProviderResult,
  TopupParams,
} from '../interfaces/provider.interface';

export type MockBuyCardBehavior =
  | 'SUCCESS'
  | 'OUT_OF_STOCK'
  | 'LOW_BALANCE'
  | 'TIMEOUT'
  | 'UNKNOWN';

export type MockTopupBehavior = MockBuyCardBehavior;

/**
 * Mock eSale adapter — NOT real eSale API (Phase 2F).
 */
@Injectable()
export class MockESaleProvider implements ProviderInterface {
  readonly code = PROVIDER_CODES.ESALE;

  static buyCardBehavior: MockBuyCardBehavior = 'SUCCESS';
  static topupBehavior: MockTopupBehavior = 'SUCCESS';
  static balance = 10_000_000;
  static timeoutRecovery = new Map<string, ProviderResult>();

  static reset(): void {
    MockESaleProvider.buyCardBehavior = 'SUCCESS';
    MockESaleProvider.topupBehavior = 'SUCCESS';
    MockESaleProvider.balance = 10_000_000;
    MockESaleProvider.timeoutRecovery.clear();
  }

  async buyCard(params: BuyCardParams): Promise<ProviderResult> {
    const behavior = MockESaleProvider.buyCardBehavior;

    if (behavior === 'OUT_OF_STOCK') {
      return {
        success: false,
        status: ProviderTransactionStatus.FAILED,
        failureCode: 'OUT_OF_STOCK',
        message: 'Mock eSale out of stock',
        rawResponse: { mock: true, behavior },
      };
    }

    if (behavior === 'LOW_BALANCE') {
      return {
        success: false,
        status: ProviderTransactionStatus.FAILED,
        failureCode: 'LOW_BALANCE',
        message: 'Mock eSale insufficient balance',
        rawResponse: { mock: true, behavior },
      };
    }

    if (behavior === 'TIMEOUT') {
      return {
        success: false,
        status: ProviderTransactionStatus.TIMEOUT,
        failureCode: 'TIMEOUT',
        message: 'Mock eSale request timeout',
        rawResponse: { mock: true, behavior, requestId: params.requestId },
      };
    }

    if (behavior === 'UNKNOWN') {
      return {
        success: false,
        status: ProviderTransactionStatus.FAILED,
        failureCode: 'UNKNOWN',
        message: 'Mock eSale unknown error',
        rawResponse: { mock: true, behavior },
      };
    }

    const cards = Array.from({ length: params.quantity }, (_, index) => ({
      serial: `SN-${params.requestId}-${index + 1}`,
      pin: `PIN-${params.requestId}-${index + 1}`,
      expiredAt: new Date(Date.now() + 365 * 86_400_000),
    }));

    return {
      success: true,
      status: ProviderTransactionStatus.SUCCESS,
      providerTransactionId: `ESALE-TXN-${params.requestId}`,
      providerReference: params.requestId,
      cards,
      rawResponse: {
        mock: true,
        requestId: params.requestId,
        quantity: params.quantity,
      },
    };
  }

  async topup(params: TopupParams): Promise<ProviderResult> {
    const behavior = MockESaleProvider.topupBehavior;

    if (behavior === 'OUT_OF_STOCK') {
      return {
        success: false,
        status: ProviderTransactionStatus.FAILED,
        failureCode: 'OUT_OF_STOCK',
        message: 'Mock eSale topup out of stock',
        rawResponse: { mock: true, behavior },
      };
    }

    if (behavior === 'LOW_BALANCE') {
      return {
        success: false,
        status: ProviderTransactionStatus.FAILED,
        failureCode: 'LOW_BALANCE',
        message: 'Mock eSale topup insufficient balance',
        rawResponse: { mock: true, behavior },
      };
    }

    if (behavior === 'TIMEOUT') {
      return {
        success: false,
        status: ProviderTransactionStatus.TIMEOUT,
        failureCode: 'TIMEOUT',
        message: 'Mock eSale topup request timeout',
        rawResponse: { mock: true, behavior, requestId: params.requestId },
      };
    }

    if (behavior === 'UNKNOWN') {
      return {
        success: false,
        status: ProviderTransactionStatus.FAILED,
        failureCode: 'UNKNOWN',
        message: 'Mock eSale topup unknown error',
        rawResponse: { mock: true, behavior },
      };
    }

    return {
      success: true,
      status: ProviderTransactionStatus.SUCCESS,
      providerTransactionId: `ESALE-TOPUP-${params.requestId}`,
      providerReference: params.requestId,
      rawResponse: {
        mock: true,
        requestId: params.requestId,
        phoneNumber: params.phoneNumber,
        amount: params.amount,
      },
    };
  }

  async checkTransaction(
    requestId: string,
    context?: { providerTransactionDate?: string; kind?: 'CARD' | 'TOPUP' },
  ): Promise<ProviderResult> {
    if (!context?.providerTransactionDate) {
      const recovered = MockESaleProvider.timeoutRecovery.get(requestId);
      if (recovered) {
        return recovered;
      }
      return {
        success: false,
        status: ProviderTransactionStatus.FAILED,
        failureCode: 'UNKNOWN',
        message: 'Transaction not found',
        rawResponse: { mock: true, requestId },
      };
    }

    const recovered = MockESaleProvider.timeoutRecovery.get(requestId);
    if (recovered) {
      return recovered;
    }
    if (context?.kind === 'TOPUP' && MockESaleProvider.topupBehavior === 'TIMEOUT') {
      return {
        success: false,
        status: ProviderTransactionStatus.TIMEOUT,
        failureCode: 'TIMEOUT',
        message: 'Mock topup still processing',
        rawResponse: { mock: true, requestId },
      };
    }
    return {
      success: false,
      status: ProviderTransactionStatus.FAILED,
      failureCode: 'UNKNOWN',
      message: 'Transaction not found',
      rawResponse: { mock: true, requestId },
    };
  }

  async getBalance(): Promise<BalanceResult> {
    return { balance: MockESaleProvider.balance, currency: 'VND' };
  }

  async syncProducts(): Promise<ProductSyncResult> {
    return { synced: 0, message: 'Mock sync — not implemented' };
  }
}
