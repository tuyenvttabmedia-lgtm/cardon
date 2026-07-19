import { Injectable, Logger } from '@nestjs/common';
import { PaymentGatewayCode } from '@prisma/client';
import {
  CreateProviderPaymentParams,
  PaymentProviderInterface,
  ProviderPaymentResult,
  ProviderTransactionStatus,
  RefundResult,
  WebhookVerificationResult,
} from '../payment-provider.interface';
import { verifySepayWebhookAuth } from './sepay.auth';
import { SepayConfigService } from './sepay.config';
import {
  buildSepayPgCheckoutFields,
  getSepayPgCheckoutUrl,
} from './sepay.pg';
import { buildSepayQrUrl } from './sepay.qr';
import {
  buildTransferContent,
  extractPaymentReference,
  formatSepayAmount,
  isSepayPgIpnPayload,
  mapSepayPgIpnToVerification,
  mapSepayTransferToStatus,
  SepayPgIpnPayload,
  SepayWebhookPayload,
} from './sepay.types';

function appendGuestEmailToUrl(url: string, guestEmail?: string | null): string {
  const email = guestEmail?.trim();
  if (!email) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}email=${encodeURIComponent(email)}`;
}

@Injectable()
export class SePayProvider implements PaymentProviderInterface {
  readonly gateway = PaymentGatewayCode.SEPAY;
  private readonly logger = new Logger(SePayProvider.name);

  constructor(private readonly configService: SepayConfigService) {}

  async createPayment(
    params: CreateProviderPaymentParams,
  ): Promise<ProviderPaymentResult> {
    const config = this.configService.getConfig();
    const amountInt = Math.round(parseFloat(params.amount));

    if (config.mode === 'payment_gateway') {
      return this.createPaymentGatewayCheckout(params, config, amountInt);
    }

    return this.createLegacyQrPayment(params, config, amountInt);
  }

  private createLegacyQrPayment(
    params: CreateProviderPaymentParams,
    config: NonNullable<ReturnType<SepayConfigService['getConfig']>>,
    amountInt: number,
  ): ProviderPaymentResult {
    const transferContent = buildTransferContent(params.paymentReference);
    const qrUrl = buildSepayQrUrl(config, {
      amount: amountInt,
      transferContent,
    });

    const expiredAt =
      params.expiresAt?.toISOString() ??
      new Date(Date.now() + 15 * 60_000).toISOString();

    this.logSafe('createPayment', {
      paymentReference: params.paymentReference,
      amount: amountInt,
    });

    return {
      paymentUrl: qrUrl,
      providerReference: params.paymentReference,
      rawResponse: {
        integrationMode: 'legacy_qr',
        qr_url: qrUrl,
        bank_info: {
          bankCode: config.bankCode,
          accountNumber: config.bankAccount,
          accountName: config.accountName,
        },
        amount: amountInt,
        transferContent,
        expired_at: expiredAt,
        gateway: this.gateway,
      },
    };
  }

  private createPaymentGatewayCheckout(
    params: CreateProviderPaymentParams,
    config: NonNullable<ReturnType<SepayConfigService['getConfig']>>,
    amountInt: number,
  ): ProviderPaymentResult {
    const baseUrl = config.publicUrl ?? 'https://cardon.vn';
    const orderPath = `${baseUrl}/orders/${params.orderId}`;
    const checkoutUrl = getSepayPgCheckoutUrl(config.environment ?? 'sandbox');
    const checkoutFormFields = buildSepayPgCheckoutFields({
      merchantId: config.merchantId!,
      merchantSecretKey: config.merchantSecretKey!,
      environment: config.environment ?? 'sandbox',
      paymentMethod: config.paymentMethod ?? 'BANK_TRANSFER',
      orderInvoiceNumber: params.paymentReference,
      orderAmount: amountInt,
      orderDescription: `CardOn ${params.paymentReference}`,
      successUrl: appendGuestEmailToUrl(`${orderPath}?payment=success`, params.guestEmail),
      errorUrl: appendGuestEmailToUrl(`${orderPath}?payment=error`, params.guestEmail),
      cancelUrl: appendGuestEmailToUrl(`${orderPath}?payment=cancel`, params.guestEmail),
    });

    this.logSafe('createPaymentPg', {
      paymentReference: params.paymentReference,
      amount: amountInt,
    });

    return {
      paymentUrl: checkoutUrl,
      providerReference: params.paymentReference,
      rawResponse: {
        integrationMode: 'payment_gateway',
        checkoutUrl,
        checkoutFormFields,
        amount: amountInt,
        gateway: this.gateway,
      },
    };
  }

  async verifyWebhook(
    payload: unknown,
    headers: Record<string, string>,
  ): Promise<WebhookVerificationResult> {
    const config = this.configService.getConfig();
    const rawBody =
      headers['x-sepay-raw-body'] ?? headers['x-raw-body'] ?? undefined;

    const valid = verifySepayWebhookAuth(headers, rawBody, {
      apiKey: config.apiKey,
      webhookSecret: config.webhookSecret,
      ipnSecretKey: config.ipnSecretKey,
    });

    if (isSepayPgIpnPayload(payload)) {
      return this.verifyPgIpnWebhook(payload, valid);
    }

    return this.verifyLegacyTransferWebhook(payload, config, valid);
  }

  private verifyPgIpnWebhook(
    payload: SepayPgIpnPayload,
    valid: boolean,
  ): WebhookVerificationResult {
    const mapped = mapSepayPgIpnToVerification(payload);

    this.logSafe('verifyWebhookPg', {
      transactionId: mapped.providerTransactionId,
      paymentReference: mapped.paymentReference || 'unknown',
      amount: mapped.amount ? Number(mapped.amount) : undefined,
      status: mapped.status,
    });

    return {
      valid,
      paymentReference: mapped.paymentReference,
      status: mapped.status,
      amount: mapped.amount,
      unknownReference: !mapped.paymentReference,
      providerTransactionId: mapped.providerTransactionId,
      rawPayload: {
        ...(payload as Record<string, unknown>),
        gateway: this.gateway,
        integrationMode: 'payment_gateway',
      },
    };
  }

  private verifyLegacyTransferWebhook(
    payload: unknown,
    config: NonNullable<ReturnType<SepayConfigService['getConfig']>>,
    valid: boolean,
  ): WebhookVerificationResult {
    const body = normalizePayload(payload) as unknown as SepayWebhookPayload;

    const paymentReference =
      extractPaymentReference(body.content ?? '', body.code) ?? '';
    const unknownReference = !paymentReference;
    const status = mapSepayTransferToStatus(
      body.transferType ?? '',
      paymentReference || null,
    );
    const amount =
      body.transferAmount != null
        ? formatSepayAmount(Number(body.transferAmount))
        : undefined;
    const providerTransactionId =
      body.id != null ? String(body.id) : undefined;

    this.logSafe('verifyWebhook', {
      transactionId: providerTransactionId,
      paymentReference: paymentReference || 'unknown',
      amount: body.transferAmount,
      status,
    });

    return {
      valid,
      paymentReference,
      status,
      amount,
      unknownReference,
      providerTransactionId,
      rawPayload: {
        ...body,
        gateway: this.gateway,
        integrationMode: 'legacy_qr',
      },
    };
  }

  async queryTransaction(reference: string): Promise<ProviderTransactionStatus> {
    this.logSafe('queryTransaction', {
      paymentReference: reference,
      amount: undefined,
      status: 'PENDING',
    });

    return {
      paymentReference: reference,
      status: 'PENDING',
      amount: '0.00',
    };
  }

  async refund(_reference: string): Promise<RefundResult> {
    return {
      success: false,
      message: 'SePay refund not implemented — placeholder for future phase',
    };
  }

  private logSafe(
    action: string,
    fields: {
      transactionId?: string;
      paymentReference: string;
      amount?: number;
      status?: string;
    },
  ): void {
    this.logger.log(
      `SePay ${action} transaction_id=${fields.transactionId ?? 'n/a'} payment_reference=${fields.paymentReference}${fields.amount != null ? ` amount=${fields.amount}` : ''}${fields.status ? ` status=${fields.status}` : ''}`,
    );
  }
}

function normalizePayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }
  return payload as Record<string, unknown>;
}
