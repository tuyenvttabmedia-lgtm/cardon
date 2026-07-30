import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  buildMegapayPgCancelTokens,
  buildMegapayPgStatusToken,
  getMegapayPgApiUrls,
} from './megapay-pg';
import { MegapayConfigService } from './megapay.config';

export type MegapayFetchFn = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface MegapayPgStatusResult {
  resultCd?: string;
  resultMsg?: string;
  trxId?: string;
  merId?: string;
  merTrxId?: string;
  invoiceNo?: string;
  amount?: string;
  payType?: string;
  raw: Record<string, unknown>;
}

export interface MegapayPgCancelResult {
  resultCd?: string;
  resultMsg?: string;
  trxId?: string;
  cancelTrxId?: string;
  merTrxId?: string;
  amount?: string;
  raw: Record<string, unknown>;
}

@Injectable()
export class MegapayPgHttpClient {
  private readonly logger = new Logger(MegapayPgHttpClient.name);
  private readonly fetchFn: MegapayFetchFn;

  constructor(
    private readonly configService: MegapayConfigService,
    @Optional() fetchFn?: MegapayFetchFn,
  ) {
    this.fetchFn = fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  /** Query PG transaction status by merchant trx id (PAY-…). */
  async queryByMerTrxId(merTrxId: string): Promise<MegapayPgStatusResult> {
    const config = this.configService.getConfig();
    const merId = config.pgMerchantId || config.merchantId;
    const timeStamp = String(Date.now());
    const merchantToken = buildMegapayPgStatusToken({
      timeStamp,
      merTrxId,
      merId,
      encodeKey: config.pgEncodeKey,
    });
    const urls = getMegapayPgApiUrls(config.pgEnvironment);
    const body = new URLSearchParams({
      merId,
      merTrxId,
      timeStamp,
      merchantToken,
    });

    const response = await this.fetchFn(urls.trxStatusUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json, text/plain, */*',
      },
      body,
    });
    const raw = await this.parseBody(response);
    // trxStatus.do wraps the actual transaction in `data`. The outer resultCd only
    // confirms that the query itself succeeded; payment status lives in data.resultCd.
    const transaction =
      raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)
        ? (raw.data as Record<string, unknown>)
        : raw;
    this.logger.log(
      `MegaPay trxStatus merTrxId=${merTrxId} http=${response.status} resultCd=${String(transaction.resultCd ?? raw.resultCd ?? '')}`,
    );
    return {
      resultCd: asString(transaction.resultCd ?? raw.resultCd),
      resultMsg: asString(transaction.resultMsg ?? raw.resultMsg),
      trxId: asString(transaction.trxId),
      merId: asString(transaction.merId ?? raw.merId),
      merTrxId: asString(transaction.merTrxId ?? raw.merTrxId) ?? merTrxId,
      invoiceNo: asString(transaction.invoiceNo),
      amount: asString(transaction.amount),
      payType: asString(transaction.payType),
      raw,
    };
  }

  async cancelPayment(params: {
    merTrxId: string;
    trxId: string;
    amount: string | number;
    payType?: string;
    cancelMsg?: string;
  }): Promise<MegapayPgCancelResult> {
    const config = this.configService.getConfig();
    if (!config.pgRefundPassword) {
      throw new Error('MegaPay PG refund password is not configured');
    }
    const merId = config.pgMerchantId || config.merchantId;
    const timeStamp = String(Date.now());
    const amount = String(Math.round(Number(params.amount)));
    const { merchantToken, hash } = buildMegapayPgCancelTokens({
      timeStamp,
      merTrxId: params.merTrxId,
      trxId: params.trxId,
      merId,
      amount,
      encodeKey: config.pgEncodeKey,
      refundPassword: config.pgRefundPassword,
    });
    const urls = getMegapayPgApiUrls(config.pgEnvironment);
    const body = new URLSearchParams({
      merId,
      merTrxId: params.merTrxId,
      trxId: params.trxId,
      amount,
      payType: params.payType ?? 'QR',
      timeStamp,
      merchantToken,
      hash,
      refundData: config.pgRefundPassword,
      cancelPw: config.pgRefundPassword,
      cancelMsg: params.cancelMsg ?? 'CardOn refund request',
      cancelRetryCount: '0',
      fee: '0',
      vat: '0',
      notax: '0',
    });

    const response = await this.fetchFn(urls.paymentCancelUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json, text/plain, */*',
      },
      body,
    });
    const raw = await this.parseBody(response);
    this.logger.log(
      `MegaPay paymentCancel merTrxId=${params.merTrxId} trxId=${params.trxId} http=${response.status} resultCd=${String(raw.resultCd ?? '')}`,
    );
    return {
      resultCd: asString(raw.resultCd),
      resultMsg: asString(raw.resultMsg),
      trxId: asString(raw.trxId),
      cancelTrxId: asString(raw.cancelTrxId),
      merTrxId: asString(raw.merTrxId) ?? params.merTrxId,
      amount: asString(raw.amount),
      raw,
    };
  }

  private async parseBody(response: Response): Promise<Record<string, unknown>> {
    const text = await response.text();
    if (!text.trim()) return {};
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return { value: parsed };
    } catch {
      return { rawText: text };
    }
  }
}

function asString(value: unknown): string | undefined {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text.length ? text : undefined;
}
