import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  MegapayCreateRequest,
  MegapayCreateResponse,
  MegapayQueryResponse,
} from './megapay.types';
import { MegapayConfigService } from './megapay.config';
import { signMegapayRequest } from './megapay.signature';

export type MegapayFetchFn = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

@Injectable()
export class MegapayHttpClient {
  private readonly logger = new Logger(MegapayHttpClient.name);
  private readonly fetchFn: MegapayFetchFn;

  constructor(
    private readonly configService: MegapayConfigService,
    @Optional() fetchFn?: MegapayFetchFn,
  ) {
    this.fetchFn = fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  async createCheckout(params: {
    orderId: string;
    amount: number;
    description: string;
  }): Promise<MegapayCreateResponse> {
    const config = this.configService.getConfig();

    const unsigned: Omit<MegapayCreateRequest, 'signature'> = {
      merchant_id: config.merchantId,
      order_id: params.orderId,
      amount: params.amount,
      description: params.description,
      return_url: config.returnUrl,
      callback_url: config.callbackUrl,
    };

    const signature = signMegapayRequest(unsigned, config.secretKey);
    const body: MegapayCreateRequest = { ...unsigned, signature };

    const url = `${config.endpoint}/v1/checkout/create`;
    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`MegaPay create failed with HTTP ${response.status}`);
    }

    const data = (await response.json()) as MegapayCreateResponse;
    this.logSafe('createPayment', {
      request_id: data.request_id,
      payment_reference: data.order_id,
      status: data.status,
    });
    return data;
  }

  async queryTransaction(orderId: string): Promise<MegapayQueryResponse> {
    const config = this.configService.getConfig();

    const queryFields = {
      merchant_id: config.merchantId,
      order_id: orderId,
    };
    const signature = signMegapayRequest(queryFields, config.secretKey);
    const params = new URLSearchParams({
      merchant_id: config.merchantId,
      order_id: orderId,
      signature,
    });

    const url = `${config.endpoint}/v1/checkout/query?${params.toString()}`;
    const response = await this.fetchFn(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`MegaPay query failed with HTTP ${response.status}`);
    }

    const data = (await response.json()) as MegapayQueryResponse;
    this.logSafe('queryTransaction', {
      request_id: data.request_id,
      payment_reference: data.order_id,
      status: data.status,
    });
    return data;
  }

  private logSafe(
    action: string,
    fields: { request_id?: string; payment_reference: string; status: string },
  ): void {
    this.logger.log(
      `MegaPay ${action} request_id=${fields.request_id ?? 'n/a'} payment_reference=${fields.payment_reference} status=${fields.status}`,
    );
  }
}
