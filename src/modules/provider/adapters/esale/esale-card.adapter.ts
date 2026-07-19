import { Injectable, Logger } from '@nestjs/common';
import { ProviderTransactionStatus } from '@prisma/client';
import {
  BalanceResult,
  BuyCardParams,
  ProviderCardItem,
  ProviderCheckContext,
  ProviderResult,
} from '../../interfaces/provider.interface';
import { EsaleHttpClient, EsaleHttpError } from './esale.client';
import { EsaleConfigService } from './esale.config';
import {
  buildFailedResult,
  isEsaleProcessingRetCode,
  parseEsaleExpiredDate,
  parseProviderProductCode,
} from './esale.mapper';
import {
  buildResponseVerifyPayload,
  decryptCardPin,
  verifyEsaleResponseSignature,
} from './esale.signature';
import {
  EsaleApiResponse,
  EsaleBalanceData,
  EsaleBuyCardData,
  EsaleCardListData,
  EsaleCardListItem,
  EsaleCheckTransactionData,
} from './esale.types';

export interface EsaleCardCatalogItem {
  supplierCode: string;
  cardId: number;
  cardName: string;
  faceValue: number;
  discount: number;
  providerCost: number;
}

/**
 * eSale CARD API adapter — getcardlist, buycard, checktransaction, getbalance.
 */
@Injectable()
export class EsaleCardAdapter {
  private readonly logger = new Logger(EsaleCardAdapter.name);

  constructor(
    private readonly configService: EsaleConfigService,
    private readonly client: EsaleHttpClient,
  ) {}

  async getCardList(cardType?: string): Promise<EsaleCardCatalogItem[]> {
    const types = cardType ? [cardType] : ['Card', 'Game', 'Card3G'];
    const items: EsaleCardCatalogItem[] = [];

    for (const type of types) {
      const response = await this.client.getCardList(type);
      if (response.retCode !== 1 || !response.data?.info?.length) {
        continue;
      }
      items.push(...response.data.info.map(mapEsaleCardListItem));
    }

    return items;
  }

  async buyCard(params: BuyCardParams): Promise<ProviderResult> {
    let supplierCode: string;
    let cardId: number;
    try {
      ({ supplierCode, cardId } = parseProviderProductCode(params.providerProductCode));
    } catch (error) {
      return {
        success: false,
        status: ProviderTransactionStatus.FAILED,
        failureCode: 'INVALID_SKU',
        message: error instanceof Error ? error.message : 'Invalid product code',
      };
    }

    const context = this.resolveRequestContext(params);

    try {
      const response = await this.client.buyCard({
        transId: params.requestId,
        supplierCode,
        cardId,
        quantity: params.quantity,
        transactionDate: context.transactionDate,
        time: context.requestTime,
      });

      return this.mapCardResponse(response, {
        requestId: params.requestId,
        requestTime: context.requestTime,
      });
    } catch (error) {
      return this.handleHttpError(error, params.requestId);
    }
  }

  async checkTransaction(
    requestId: string,
    context?: ProviderCheckContext,
  ): Promise<ProviderResult> {
    if (!context?.providerTransactionDate) {
      return {
        success: false,
        status: ProviderTransactionStatus.FAILED,
        failureCode: 'UNKNOWN',
        message: 'Persisted transaction metadata required for checkTransaction',
        rawResponse: { requestId },
      };
    }

    const checkTime = Math.floor(Date.now() / 1000).toString();
    const requestTime = context.providerRequestTime ?? checkTime;

    try {
      const response = await this.client.checkCardTransaction({
        transId: requestId,
        transactionDate: context.providerTransactionDate,
        isGetCard: 1,
        time: checkTime,
      });

      return this.mapCardResponse(response, { requestId, requestTime });
    } catch (error) {
      return this.handleHttpError(error, requestId);
    }
  }

  async getBalance(): Promise<BalanceResult> {
    const transId = `BAL-${Date.now()}`;
    const response = await this.client.getCardBalance(transId);
    if (response.retCode !== 1 || !response.data) {
      throw new Error(response.retMsg || 'Failed to fetch eSale card balance');
    }
    return mapBalanceResponse(response.data);
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

  private mapCardResponse(
    response: EsaleApiResponse<EsaleBuyCardData | EsaleCheckTransactionData>,
    params: { requestId: string; requestTime: string },
  ): ProviderResult {
    const rawResponse = response as unknown as Record<string, unknown>;
    const data = response.data;

    if (response.retCode === 1 && data) {
      if (
        !this.verifyCardResponseSignature(
          response.retCode,
          params.requestId,
          params.requestTime,
          data,
        )
      ) {
        this.logger.warn(
          `eSale response signature verification failed for transId=${params.requestId}`,
        );
      }

      const cards = this.decryptCards(data.cardsList ?? []);
      return {
        success: true,
        status: ProviderTransactionStatus.SUCCESS,
        providerTransactionId: data.eSaleTransId,
        providerReference: params.requestId,
        cards,
        rawResponse,
      };
    }

    if (isEsaleProcessingRetCode(response.retCode)) {
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

  private decryptCards(
    cardsList: Array<{ serial: string; cardCode: string; expiredDate: string }>,
  ): ProviderCardItem[] {
    const config = this.configService.getConfig();
    return cardsList.map((card) => ({
      serial: card.serial,
      pin: decryptCardPin(card.cardCode, config.privateKeyPem),
      expiredAt: parseEsaleExpiredDate(card.expiredDate),
    }));
  }

  private verifyCardResponseSignature(
    retCode: number,
    transId: string,
    requestTime: string,
    data: EsaleBuyCardData | EsaleCheckTransactionData,
  ): boolean {
    const config = this.configService.getConfig();
    if (!config.verifyResponseSignature || !config.esalePublicKeyPem) {
      return true;
    }
    if (!data.signature) {
      return false;
    }
    const payload = buildResponseVerifyPayload({
      retCode,
      transId,
      time: requestTime,
      cards: data.cardsList,
    });
    return verifyEsaleResponseSignature({
      payload,
      signature: data.signature,
      publicKeyPem: config.esalePublicKeyPem,
    });
  }

  private handleHttpError(error: unknown, requestId: string): ProviderResult {
    if (error instanceof EsaleHttpError && error.timeout) {
      return {
        success: false,
        status: ProviderTransactionStatus.TIMEOUT,
        failureCode: 'TIMEOUT',
        message: error.message,
        rawResponse: { requestId, timeout: true },
      };
    }

    const message =
      error instanceof Error ? error.message : 'Unknown eSale HTTP error';
    this.logger.error(`eSale card request failed requestId=${requestId}: ${message}`);
    return {
      success: false,
      status: ProviderTransactionStatus.FAILED,
      failureCode: 'UNKNOWN',
      message,
      rawResponse: { requestId },
    };
  }
}

function mapEsaleCardListItem(item: EsaleCardListItem): EsaleCardCatalogItem {
  return {
    supplierCode: item.supplierCode,
    cardId: item.cardId,
    cardName: item.cardName,
    faceValue: item.unitPrice,
    discount: item.discount,
    providerCost: item.priceDiscount,
  };
}

function mapBalanceResponse(data: EsaleBalanceData): BalanceResult {
  return {
    balance: Number(data.balance),
    currency: 'VND',
  };
}

export function buildEsaleProviderProductCode(
  supplierCode: string,
  cardId: number,
): string {
  return `${supplierCode}:${cardId}`;
}
