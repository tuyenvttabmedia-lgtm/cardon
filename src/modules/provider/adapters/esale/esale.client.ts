import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  EsaleApiResponse,
  EsaleBalanceData,
  EsaleBuyCardData,
  EsaleCardListData,
  EsaleCheckTransactionData,
  EsaleTopupData,
} from './esale.types';
import { EsaleConfigService } from './esale.config';
import {
  signBuyCardRequest,
  signCheckTransactionRequest,
  signGetBalanceCardRequest,
  signGetCardListRequest,
  signTopupCheckTransactionRequest,
  signTopupGetBalanceRequest,
  signTopupRequest,
  signTopupDataRequest,
} from './esale.signature';
import { formatEsaleTransactionDate } from './esale.mapper';

export type EsaleFetchFn = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export class EsaleHttpError extends Error {
  constructor(
    message: string,
    readonly timeout = false,
  ) {
    super(message);
    this.name = 'EsaleHttpError';
  }
}

@Injectable()
export class EsaleHttpClient {
  private readonly logger = new Logger(EsaleHttpClient.name);
  private readonly fetchFn: EsaleFetchFn;

  constructor(
    private readonly configService: EsaleConfigService,
    @Optional() fetchFn?: EsaleFetchFn,
  ) {
    this.fetchFn = fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  async getCardList(cardType: string): Promise<EsaleApiResponse<EsaleCardListData>> {
    const config = this.configService.getConfig();
    const time = this.unixTime();
    const sig = signGetCardListRequest({
      agencyCode: config.agencyCode,
      time,
      secretKey: config.secretKey,
    });

    return this.post<EsaleCardListData>(`${config.cardApiUrl}getcardlist`, {
      agencyCode: config.agencyCode,
      clientCode: config.clientCode,
      cardType,
      time,
      sig,
    });
  }

  async buyCard(params: {
    transId: string;
    supplierCode: string;
    cardId: number;
    quantity: number;
    transactionDate: string;
    time: string;
  }): Promise<EsaleApiResponse<EsaleBuyCardData>> {
    const config = this.configService.getConfig();
    const { checkSum, signature } = signBuyCardRequest({
      agencyCode: config.agencyCode,
      transId: params.transId,
      supplierCode: params.supplierCode,
      cardId: params.cardId,
      quantity: params.quantity,
      time: params.time,
      secretKey: config.secretKey,
      privateKeyPem: config.privateKeyPem,
    });

    return this.post<EsaleBuyCardData>(`${config.cardApiUrl}buycard`, {
      transId: params.transId,
      agencyCode: config.agencyCode,
      clientCode: config.clientCode,
      supplierCode: params.supplierCode,
      cardId: params.cardId,
      quantity: params.quantity,
      transactionDate: params.transactionDate,
      time: params.time,
      checkSum,
      signature,
    });
  }

  async checkCardTransaction(params: {
    transId: string;
    transactionDate: string;
    isGetCard: number;
    time: string;
  }): Promise<EsaleApiResponse<EsaleCheckTransactionData>> {
    const config = this.configService.getConfig();
    const { checkSum, signature } = signCheckTransactionRequest({
      agencyCode: config.agencyCode,
      transId: params.transId,
      isGetCard: params.isGetCard,
      time: params.time,
      secretKey: config.secretKey,
      privateKeyPem: config.privateKeyPem,
    });

    return this.post<EsaleCheckTransactionData>(
      `${config.cardApiUrl}checktransaction`,
      {
        transId: params.transId,
        agencyCode: config.agencyCode,
        clientCode: config.clientCode,
        transactionDate: params.transactionDate,
        isGetCard: params.isGetCard,
        time: params.time,
        checkSum,
        signature,
      },
    );
  }

  async getCardBalance(transId: string): Promise<EsaleApiResponse<EsaleBalanceData>> {
    const config = this.configService.getConfig();
    const time = this.unixTime();
    const sig = signGetBalanceCardRequest({
      transId,
      agencyCode: config.agencyCode,
      time,
      secretKey: config.secretKey,
    });

    return this.post<EsaleBalanceData>(`${config.cardApiUrl}getbalance`, {
      transId,
      agencyCode: config.agencyCode,
      clientCode: config.clientCode,
      time,
      sig,
    });
  }

  async topup(params: {
    transId: string;
    phoneNumber: string;
    amount: number;
    telco?: string;
    transDate: string;
    time: string;
  }): Promise<EsaleApiResponse<EsaleTopupData>> {
    const config = this.configService.getConfig();
    const { checkSum, signature } = signTopupRequest({
      agencyCode: config.agencyCode,
      transId: params.transId,
      phoneNumber: params.phoneNumber,
      amount: params.amount,
      transDate: params.transDate,
      time: params.time,
      secretKey: config.secretKey,
      privateKeyPem: config.privateKeyPem,
    });

    const body: Record<string, string | number> = {
      transId: params.transId,
      agencyCode: config.agencyCode,
      clientCode: config.clientCode,
      phoneNumber: params.phoneNumber,
      amount: params.amount,
      transDate: params.transDate,
      time: params.time,
      checkSum,
      signature,
    };
    if (params.telco) {
      body.telco = params.telco;
    }

    return this.post<EsaleTopupData>(`${config.topupApiUrl}topup`, body);
  }

  async topupData(params: {
    transId: string;
    phoneNumber: string;
    supplierCode: string;
    cardId: number;
    transDate: string;
    time: string;
  }): Promise<EsaleApiResponse<EsaleTopupData>> {
    const config = this.configService.getConfig();
    const { checkSum, signature } = signTopupDataRequest({
      agencyCode: config.agencyCode,
      transId: params.transId,
      supplierCode: params.supplierCode,
      cardId: params.cardId,
      phoneNumber: params.phoneNumber,
      transDate: params.transDate,
      time: params.time,
      secretKey: config.secretKey,
      privateKeyPem: config.privateKeyPem,
    });

    return this.post<EsaleTopupData>(`${config.cardApiUrl}topupdata`, {
      transId: params.transId,
      agencyCode: config.agencyCode,
      clientCode: config.clientCode,
      supplierCode: params.supplierCode,
      cardId: params.cardId,
      phoneNumber: params.phoneNumber,
      transDate: params.transDate,
      time: params.time,
      checkSum,
      signature,
    });
  }

  async checkTopupTransaction(params: {
    transId: string;
    transDate: string;
    time: string;
  }): Promise<EsaleApiResponse<EsaleTopupData>> {
    const config = this.configService.getConfig();
    const sig = signTopupCheckTransactionRequest({
      agencyCode: config.agencyCode,
      transId: params.transId,
      transDate: params.transDate,
      time: params.time,
      secretKey: config.secretKey,
    });

    return this.post<EsaleTopupData>(`${config.topupApiUrl}checktransaction`, {
      agencyCode: config.agencyCode,
      clientCode: config.clientCode,
      transId: params.transId,
      transDate: params.transDate,
      time: params.time,
      sig,
    });
  }

  async getTopupBalance(): Promise<EsaleApiResponse<EsaleBalanceData>> {
    const config = this.configService.getConfig();
    const time = this.unixTime();
    const sig = signTopupGetBalanceRequest({
      agencyCode: config.agencyCode,
      time,
      secretKey: config.secretKey,
    });

    return this.post<EsaleBalanceData>(`${config.topupApiUrl}getbalance`, {
      agencyCode: config.agencyCode,
      clientCode: config.clientCode,
      time,
      sig,
    });
  }

  private async post<T>(
    url: string,
    body: Record<string, string | number>,
  ): Promise<EsaleApiResponse<T>> {
    const config = this.configService.getConfig();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new EsaleHttpError(`eSale HTTP ${response.status}`);
      }

      const data = (await response.json()) as EsaleApiResponse<T>;
      this.logSafe(url, data.retCode, body.transId as string | undefined);
      return data;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new EsaleHttpError('eSale request timeout', true);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private unixTime(): string {
    return Math.floor(Date.now() / 1000).toString();
  }

  createTransactionContext(): { transactionDate: string; time: string } {
    const now = new Date();
    return {
      transactionDate: formatEsaleTransactionDate(now),
      time: Math.floor(now.getTime() / 1000).toString(),
    };
  }

  private logSafe(url: string, retCode: number, transId?: string): void {
    const endpoint = url.split('/').pop() ?? url;
    this.logger.log(
      `eSale ${endpoint} retCode=${retCode} transId=${transId ?? 'n/a'}`,
    );
  }
}
