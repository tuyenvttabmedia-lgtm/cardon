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
import { DepositCodeHttpClient } from './depositcode.client';
import { verifyDepositCodeNotifySignature } from './depositcode.crypto';
import {
  DepositCodeNotifyPayload,
  normalizeDepositCodeNotify,
} from './depositcode.types';
import { MegapayConfigService } from './megapay.config';

@Injectable()
export class MegaPayProvider implements PaymentProviderInterface {
  readonly gateway = PaymentGatewayCode.MEGAPAY;

  constructor(
    private readonly configService: MegapayConfigService,
    private readonly httpClient: DepositCodeHttpClient,
  ) {}

  async createPayment(
    params: CreateProviderPaymentParams,
  ): Promise<ProviderPaymentResult> {
    const amountInt = Math.round(parseFloat(params.amount));
    const customerName = `CARDON ${params.paymentReference}`.slice(0, 50);

    const response = await this.httpClient.registerVirtualAccount({
      mapId: params.paymentReference,
      amount: amountInt,
      customerName,
      expiresAt: params.expiresAt,
      email: params.guestEmail,
    });

    if (response.response_code !== '00') {
      throw new Error(
        `DepositCode register failed: ${response.response_code} ${response.message ?? ''}`.trim(),
      );
    }

    const qrUrl =
      response.qr_url ||
      (response.qr_code
        ? `data:image/png;base64,${response.qr_code}`
        : undefined);

    if (!qrUrl) {
      throw new Error('DepositCode register succeeded but no QR returned');
    }

    const expiredAt =
      params.expiresAt?.toISOString() ??
      new Date(Date.now() + 24 * 60 * 60_000).toISOString();

    return {
      paymentUrl: qrUrl,
      providerReference: response.account_no ?? params.paymentReference,
      rawResponse: {
        integrationMode: 'deposit_code_va',
        response_code: response.response_code,
        map_id: response.map_id ?? params.paymentReference,
        account_no: response.account_no,
        account_name: response.account_name,
        bank_code: response.bank_code,
        bank_name: response.bank_name,
        qr_url: qrUrl,
        qr_code: response.qr_code,
        qr_dataRaw: response.qr_dataRaw,
        bank_info: {
          bankCode: response.bank_code,
          accountNumber: response.account_no,
          accountName: response.account_name,
        },
        amount: amountInt,
        transferContent: response.account_no,
        expired_at: expiredAt,
        gateway: this.gateway,
      },
    };
  }

  async verifyWebhook(
    payload: unknown,
    _headers: Record<string, string>,
  ): Promise<WebhookVerificationResult> {
    const body = normalizePayload(payload) as DepositCodeNotifyPayload;
    const notify = normalizeDepositCodeNotify(body);
    const config = this.configService.getConfig();

    const requiredOk =
      !!notify.requestId &&
      !!notify.referenceId &&
      !!notify.requestTime &&
      !!notify.mapId &&
      !!notify.vaAcc &&
      notify.amount !== '' &&
      !!notify.signature;

    if (!requiredOk) {
      return {
        valid: false,
        paymentReference: notify.mapId,
        status: 'PENDING',
        rawPayload: { ...notify, gateway: this.gateway },
      };
    }

    const valid = verifyDepositCodeNotifySignature({
      requestId: notify.requestId,
      referenceId: notify.referenceId,
      requestTime: notify.requestTime,
      amount: notify.amount,
      fee: notify.fee || '0',
      vaAcc: notify.vaAcc,
      mapId: notify.mapId,
      signatureHex: notify.signature,
      publicKeyPem: config.notifyPublicKey,
    });

    const amountNum = parseFloat(notify.amount);
    const amount =
      Number.isFinite(amountNum) ? amountNum.toFixed(2) : undefined;

    return {
      valid,
      paymentReference: notify.mapId,
      status: valid ? 'SUCCESS' : 'PENDING',
      amount,
      providerTransactionId: notify.referenceId,
      rawPayload: {
        ...notify,
        gateway: this.gateway,
        integrationMode: 'deposit_code_va',
      },
    };
  }

  async queryTransaction(reference: string): Promise<ProviderTransactionStatus> {
    // DepositCode status API only confirms VA mapping — payment success is notify-driven.
    const result = await this.httpClient.checkStatusByMapId(reference);
    return {
      paymentReference: result.map_id ?? reference,
      status: result.response_code === '00' ? 'PENDING' : 'FAILED',
      amount: result.amount != null ? String(result.amount) : '0',
    };
  }

  async refund(_reference: string): Promise<RefundResult> {
    return {
      success: false,
      message:
        'DepositCode VA refund is not supported via API — handle manually / cancel mapping',
    };
  }
}

function normalizePayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }
  return payload as Record<string, unknown>;
}
