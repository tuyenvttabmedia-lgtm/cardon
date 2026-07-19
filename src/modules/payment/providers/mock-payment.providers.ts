import { createHmac, timingSafeEqual } from 'crypto';
import { PaymentGatewayCode, PaymentRecordStatus } from '@prisma/client';
import { MOCK_WEBHOOK_SECRET } from '../entities/payment.constants';
import {
  CreateProviderPaymentParams,
  PaymentProviderInterface,
  ProviderPaymentResult,
  ProviderTransactionStatus,
  RefundResult,
  WebhookVerificationResult,
} from './payment-provider.interface';

/**
 * Mock adapter — NOT real MegaPay API.
 * Returns synthetic payment URL for Payment Core testing.
 */
export class MockMegaPayProvider implements PaymentProviderInterface {
  readonly gateway = PaymentGatewayCode.MEGAPAY;

  async createPayment(
    params: CreateProviderPaymentParams,
  ): Promise<ProviderPaymentResult> {
    return {
      paymentUrl: `https://mock.megapay.example/checkout/${params.paymentReference}`,
      providerReference: params.paymentReference,
      rawResponse: {
        mock: true,
        gateway: this.gateway,
        orderId: params.orderId,
      },
    };
  }

  async verifyWebhook(
    payload: unknown,
    headers: Record<string, string>,
  ): Promise<WebhookVerificationResult> {
    return verifyMockWebhook(payload, headers, this.gateway);
  }

  async queryTransaction(reference: string): Promise<ProviderTransactionStatus> {
    return {
      paymentReference: reference,
      status: PaymentRecordStatus.PENDING,
      amount: '0.00',
    };
  }

  async refund(_reference: string): Promise<RefundResult> {
    return { success: false, message: 'Refund not implemented in Payment Core' };
  }
}

export class MockSePayProvider implements PaymentProviderInterface {
  readonly gateway = PaymentGatewayCode.SEPAY;

  async createPayment(
    params: CreateProviderPaymentParams,
  ): Promise<ProviderPaymentResult> {
    return {
      paymentUrl: `https://mock.sepay.example/qr/${params.paymentReference}`,
      providerReference: params.paymentReference,
      rawResponse: {
        mock: true,
        gateway: this.gateway,
        orderId: params.orderId,
      },
    };
  }

  async verifyWebhook(
    payload: unknown,
    headers: Record<string, string>,
  ): Promise<WebhookVerificationResult> {
    return verifyMockWebhook(payload, headers, this.gateway);
  }

  async queryTransaction(reference: string): Promise<ProviderTransactionStatus> {
    return {
      paymentReference: reference,
      status: PaymentRecordStatus.PENDING,
      amount: '0.00',
    };
  }

  async refund(_reference: string): Promise<RefundResult> {
    return { success: false, message: 'Refund not implemented in Payment Core' };
  }
}

function verifyMockWebhook(
  payload: unknown,
  headers: Record<string, string>,
  gateway: PaymentGatewayCode,
): WebhookVerificationResult {
  const body = normalizePayload(payload);
  const signature =
    headers['x-webhook-signature'] ?? headers['X-Webhook-Signature'] ?? '';
  const expected = createHmac('sha256', MOCK_WEBHOOK_SECRET)
    .update(JSON.stringify(body))
    .digest('hex');

  const valid =
    signature.length > 0 &&
    signature.length === expected.length &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(expected));

  const status = mapMockWebhookStatus(body.status);

  return {
    valid,
    paymentReference: String(body.paymentReference ?? ''),
    status,
    amount: body.amount != null ? String(body.amount) : undefined,
    rawPayload: { ...body, gateway },
  };
}

function mapMockWebhookStatus(
  status: unknown,
): 'SUCCESS' | 'FAILED' | 'PENDING' {
  const upper = String(status ?? 'SUCCESS').toUpperCase();
  if (upper === 'FAILED') {
    return 'FAILED';
  }
  if (upper === 'PENDING' || upper === 'UNKNOWN') {
    return 'PENDING';
  }
  return 'SUCCESS';
}

function normalizePayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }
  return payload as Record<string, unknown>;
}

export function computeMockWebhookSignature(
  payload: Record<string, unknown>,
): string {
  return createHmac('sha256', MOCK_WEBHOOK_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');
}
