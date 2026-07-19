import { Injectable } from '@nestjs/common';
import { PaymentGatewayCode } from '@prisma/client';
import {
  CreateProviderPaymentParams,
  PaymentProviderInterface,
  ProviderPaymentResult,
  ProviderTransactionStatus,
  RefundResult,
  WebhookVerificationResult,
} from '../payment-provider.interface';
import { MegapayHttpClient } from './megapay.client';
import { MegapayConfigService } from './megapay.config';
import {
  mapMegapayQueryStatus,
  mapMegapayWebhookStatus,
  MegapayWebhookPayload,
} from './megapay.types';
import { toSignableFields, verifyMegapaySignature } from './megapay.signature';

@Injectable()
export class MegaPayProvider implements PaymentProviderInterface {
  readonly gateway = PaymentGatewayCode.MEGAPAY;

  constructor(
    private readonly configService: MegapayConfigService,
    private readonly httpClient: MegapayHttpClient,
  ) {}

  async createPayment(
    params: CreateProviderPaymentParams,
  ): Promise<ProviderPaymentResult> {
    const amountInt = Math.round(parseFloat(params.amount));

    const response = await this.httpClient.createCheckout({
      orderId: params.paymentReference,
      amount: amountInt,
      description: `CardOn order ${params.paymentReference}`,
    });

    return {
      paymentUrl: response.payment_url,
      providerReference: response.order_id,
      rawResponse: {
        request_id: response.request_id,
        order_id: response.order_id,
        status: response.status,
        gateway: this.gateway,
      },
    };
  }

  async verifyWebhook(
    payload: unknown,
    _headers: Record<string, string>,
  ): Promise<WebhookVerificationResult> {
    const body = normalizePayload(payload) as unknown as MegapayWebhookPayload;
    const config = this.configService.getConfig();

    const signable = toSignableFields(body as unknown as Record<string, unknown>);
    const signature = String(body.signature ?? '');

    const valid = verifyMegapaySignature(
      signable,
      signature,
      config.webhookSecret,
    );

    const amount =
      body.amount != null ? parseFloat(String(body.amount)).toFixed(2) : undefined;

    const providerTransactionId =
      body.request_id != null
        ? String(body.request_id)
        : undefined;

    return {
      valid,
      paymentReference: String(body.order_id ?? ''),
      status: mapMegapayWebhookStatus(String(body.status ?? 'PENDING')),
      amount,
      providerTransactionId,
      rawPayload: {
        ...body,
        gateway: this.gateway,
      },
    };
  }

  async queryTransaction(reference: string): Promise<ProviderTransactionStatus> {
    const result = await this.httpClient.queryTransaction(reference);
    return {
      paymentReference: result.order_id,
      status: mapMegapayQueryStatus(result.status),
      amount: result.amount,
    };
  }

  async refund(_reference: string): Promise<RefundResult> {
    return {
      success: false,
      message: 'MegaPay refund not implemented — placeholder for future phase',
    };
  }
}

function normalizePayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }
  return payload as Record<string, unknown>;
}
