import { Injectable } from '@nestjs/common';
import { BalanceResult } from '../../interfaces/provider.interface';
import { EsaleHttpClient } from './esale.client';
import { EsaleConfigService } from './esale.config';
import { EsaleApiResponse, EsaleTopupData } from './esale.types';

/** Map customer-facing telco ids to eSale API telco codes (not shown to customers). */
export function normalizeTelco(telco: string): string {
  const n = telco.toLowerCase().trim();
  if (n.includes('viettel')) return 'viettel';
  if (n.includes('mobifone') || n === 'mobi') return 'mobi';
  if (n.includes('vinaphone') || n === 'vina') return 'vina';
  if (n.includes('vietnamobile')) return 'vietnamobile';
  return n;
}

/**
 * eSale topup API adapter — POST /topup, checktransaction, getbalance.
 * Signature: SHA256(agencyCode|transId|phoneNumber|amount|transDate|time|secretKey) + RSA-SHA256.
 */
@Injectable()
export class EsaleTopupAdapter {
  constructor(
    private readonly configService: EsaleConfigService,
    private readonly client: EsaleHttpClient,
  ) {}

  isConfigured(): boolean {
    const config = this.configService.getConfig();
    return Boolean(config.topupApiUrl?.trim());
  }

  topup(params: {
    transId: string;
    phoneNumber: string;
    amount: number;
    telco?: string;
    transDate: string;
    time: string;
  }): Promise<EsaleApiResponse<EsaleTopupData>> {
    return this.client.topup({
      ...params,
      telco: params.telco ? normalizeTelco(params.telco) : undefined,
    });
  }

  topupData(params: {
    transId: string;
    phoneNumber: string;
    supplierCode: string;
    cardId: number;
    transDate: string;
    time: string;
  }): Promise<EsaleApiResponse<EsaleTopupData>> {
    return this.client.topupData(params);
  }

  checkTransaction(params: {
    transId: string;
    transDate: string;
    time: string;
  }): Promise<EsaleApiResponse<EsaleTopupData>> {
    return this.client.checkTopupTransaction(params);
  }

  async getBalance(): Promise<BalanceResult> {
    const response = await this.client.getTopupBalance();
    if (response.retCode !== 1 || !response.data) {
      throw new Error(response.retMsg || 'Failed to fetch eSale topup balance');
    }
    return {
      balance: Number(response.data.balance),
      currency: 'VND',
    };
  }
}
