import { Injectable, Logger } from '@nestjs/common';
import { ProviderTransactionStatus } from '@prisma/client';
import { PROVIDER_CODES } from '../../entities/provider.constants';
import {
  BalanceResult,
  BuyCardParams,
  ProductSyncResult,
  ProviderCheckContext,
  ProviderInterface,
  ProviderResult,
  TopupParams,
} from '../../interfaces/provider.interface';
import { ProviderProductSyncService } from '../../services/provider-product-sync.service';
import { EsaleConfigService } from './esale.config';
import { EsaleHttpClient } from './esale.client';
import { EsaleCardAdapter } from './esale-card.adapter';
import { EsaleTopupAdapter } from './esale-topup.adapter';
import {
  buildFailedResult,
  isCard3gDataProviderCode,
  isEsaleTopupProcessingRetCode,
  parseProviderProductCode,
  parseTopupProductCode,
} from './esale.mapper';
import { EsaleTopupData } from './esale.types';

@Injectable()
export class ESaleProvider implements ProviderInterface {
  readonly code = PROVIDER_CODES.ESALE;
  private readonly logger = new Logger(ESaleProvider.name);

  constructor(
    private readonly configService: EsaleConfigService,
    private readonly client: EsaleHttpClient,
    private readonly cardAdapter: EsaleCardAdapter,
    private readonly topupAdapter: EsaleTopupAdapter,
    private readonly productSyncService: ProviderProductSyncService,
  ) {}

  isConfigured(): boolean {
    return this.configService.isConfigured();
  }

  buyCard(params: BuyCardParams): Promise<ProviderResult> {
    return this.cardAdapter.buyCard(params);
  }

  async topup(params: TopupParams): Promise<ProviderResult> {
    const code = params.providerProductCode.trim();
    const isDataCode = code.toUpperCase().includes('_DATA_');
    const isCard3gData = isCard3gDataProviderCode(code);

    if (isCard3gData || isDataCode) {
      return this.topupDataPackage(params, code, isCard3gData);
    }

    let telco: string | undefined;
    let amount: number;

    try {
      const parsed = parseTopupProductCode(code, params.amount);
      telco = parsed.telco;
      amount = parsed.amount || params.amount;
    } catch (error) {
      return {
        success: false,
        status: ProviderTransactionStatus.FAILED,
        failureCode: 'INVALID_SKU',
        message: error instanceof Error ? error.message : 'Invalid topup code',
      };
    }

    const context = this.resolveRequestContext(params);

    try {
      const response = await this.topupAdapter.topup({
        transId: params.requestId,
        phoneNumber: params.phoneNumber,
        amount,
        telco,
        transDate: context.transactionDate,
        time: context.requestTime,
      });

      return this.mapTopupResponse(response, params.requestId);
    } catch (error) {
      return this.handleTopupHttpError(error, params.requestId);
    }
  }

  private async topupDataPackage(
    params: TopupParams,
    code: string,
    isCard3gData: boolean,
  ): Promise<ProviderResult> {
    let supplierCode: string;
    let cardId: number;

    try {
      if (isCard3gData) {
        const parsed = parseProviderProductCode(code);
        supplierCode = parsed.supplierCode;
        cardId = parsed.cardId;
      } else {
        return {
          success: false,
          status: ProviderTransactionStatus.FAILED,
          failureCode: 'INVALID_SKU',
          message:
            'DATA mapping must use Card3G format SUPPLIER3G:cardId (e.g. VIETTEL3G:606). Re-import catalog mappings.',
        };
      }
    } catch (error) {
      return {
        success: false,
        status: ProviderTransactionStatus.FAILED,
        failureCode: 'INVALID_SKU',
        message: error instanceof Error ? error.message : 'Invalid DATA provider code',
      };
    }

    const context = this.resolveRequestContext(params);

    try {
      const response = await this.topupAdapter.topupData({
        transId: params.requestId,
        phoneNumber: params.phoneNumber,
        supplierCode,
        cardId,
        transDate: context.transactionDate,
        time: context.requestTime,
      });

      return this.mapTopupResponse(response, params.requestId);
    } catch (error) {
      return this.handleTopupHttpError(error, params.requestId);
    }
  }

  async checkTransaction(
    requestId: string,
    context?: ProviderCheckContext,
  ): Promise<ProviderResult> {
    if (context?.kind === 'TOPUP') {
      if (!context.providerTransactionDate) {
        return {
          success: false,
          status: ProviderTransactionStatus.FAILED,
          failureCode: 'UNKNOWN',
          message: 'Persisted transaction metadata required for checkTransaction',
          rawResponse: { requestId },
        };
      }

      const checkTime = Math.floor(Date.now() / 1000).toString();
      try {
        const response = await this.topupAdapter.checkTransaction({
          transId: requestId,
          transDate: context.providerTransactionDate,
          time: checkTime,
        });
        return this.mapTopupResponse(response, requestId);
      } catch (error) {
        return this.handleTopupHttpError(error, requestId);
      }
    }

    return this.cardAdapter.checkTransaction(requestId, context);
  }

  async getBalance(): Promise<BalanceResult> {
    const [cardBalance, topupBalance] = await Promise.allSettled([
      this.cardAdapter.getBalance(),
      this.topupAdapter.getBalance(),
    ]);

    const card =
      cardBalance.status === 'fulfilled' ? cardBalance.value.balance : 0;
    const topup =
      topupBalance.status === 'fulfilled' ? topupBalance.value.balance : 0;

    if (cardBalance.status === 'rejected' && topupBalance.status === 'rejected') {
      throw cardBalance.reason;
    }

    return {
      balance: Math.max(card, topup),
      currency: 'VND',
    };
  }

  async syncProducts(): Promise<ProductSyncResult> {
    const catalog = await this.cardAdapter.getCardList();
    return this.productSyncService.syncEsaleCardCatalog(this.code, catalog);
  }

  private resolveRequestContext(params: {
    providerTransactionDate?: string;
    providerRequestTime?: string;
  }): { transactionDate: string; requestTime: string } {
    if (params.providerTransactionDate && params.providerRequestTime) {
      return {
        transactionDate: params.providerTransactionDate,
        requestTime: params.providerRequestTime,
      };
    }

    const generated = this.client.createTransactionContext();
    return {
      transactionDate: generated.transactionDate,
      requestTime: generated.time,
    };
  }

  private mapTopupResponse(
    response: { retCode: number; retMsg: string; data?: EsaleTopupData | null },
    requestId: string,
  ): ProviderResult {
    const rawResponse = response as Record<string, unknown>;
    const data = response.data;

    if (response.retCode === 1 && data) {
      return {
        success: true,
        status: ProviderTransactionStatus.SUCCESS,
        providerTransactionId: data.eSaleTransId,
        providerReference: requestId,
        rawResponse,
      };
    }

    if (isEsaleTopupProcessingRetCode(response.retCode)) {
      return {
        success: false,
        status: ProviderTransactionStatus.PENDING,
        failureCode: 'TIMEOUT',
        message: response.retMsg,
        providerTransactionId: data?.eSaleTransId,
        rawResponse,
      };
    }

    return buildFailedResult({
      retCode: response.retCode,
      retMsg: response.retMsg,
      providerTransactionId: data?.eSaleTransId,
      rawResponse,
    });
  }

  private handleTopupHttpError(error: unknown, requestId: string): ProviderResult {
    const message =
      error instanceof Error ? error.message : 'Unknown eSale HTTP error';
    this.logger.error(`eSale topup request failed requestId=${requestId}: ${message}`);
    return {
      success: false,
      status: ProviderTransactionStatus.FAILED,
      failureCode: 'UNKNOWN',
      message,
      rawResponse: { requestId },
    };
  }
}
