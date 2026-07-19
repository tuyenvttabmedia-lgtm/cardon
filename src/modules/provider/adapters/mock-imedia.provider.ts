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

/**
 * iMedia placeholder — future phase, same ProviderInterface surface.
 */
@Injectable()
export class MockIMediaProvider implements ProviderInterface {
  readonly code = PROVIDER_CODES.IMEDIA;

  async buyCard(_params: BuyCardParams): Promise<ProviderResult> {
    return {
      success: false,
      status: ProviderTransactionStatus.FAILED,
      failureCode: 'UNKNOWN',
      message: 'iMedia adapter not implemented — future phase',
    };
  }

  async topup(_params: TopupParams): Promise<ProviderResult> {
    return {
      success: false,
      status: ProviderTransactionStatus.FAILED,
      failureCode: 'UNKNOWN',
      message: 'iMedia topup not implemented',
    };
  }

  async checkTransaction(_requestId: string): Promise<ProviderResult> {
    return {
      success: false,
      status: ProviderTransactionStatus.FAILED,
      failureCode: 'UNKNOWN',
      message: 'iMedia checkTransaction not implemented',
    };
  }

  async getBalance(): Promise<BalanceResult> {
    return { balance: 0, currency: 'VND' };
  }

  async syncProducts(): Promise<ProductSyncResult> {
    return { synced: 0, message: 'iMedia sync not implemented' };
  }
}
