import { PaymentGatewayCode } from '@prisma/client';

export interface CreateProviderPaymentParams {
  paymentReference: string;
  amount: string;
  orderId: string;
  gateway: PaymentGatewayCode;
  expiresAt?: Date;
  guestEmail?: string | null;
  /** Force SePay legacy QR (shared STK + transfer content) even when B2C uses payment_gateway. */
  preferLegacyQr?: boolean;
}

export interface ProviderPaymentResult {
  paymentUrl: string;
  providerReference: string;
  rawResponse: Record<string, unknown>;
}

export interface WebhookVerificationResult {
  valid: boolean;
  paymentReference: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  amount?: string;
  rawPayload: Record<string, unknown>;
  /** SePay: transfer content did not match any CardOn payment_reference */
  unknownReference?: boolean;
  /** SePay bank transaction id (payload.id) for duplicate detection */
  providerTransactionId?: string;
}

export interface ProviderTransactionStatus {
  paymentReference: string;
  status: PaymentRecordStatusLike;
  amount: string;
}

export type PaymentRecordStatusLike = 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED';

export interface RefundResult {
  success: boolean;
  message: string;
}

export interface PaymentProviderInterface {
  readonly gateway: PaymentGatewayCode;

  createPayment(params: CreateProviderPaymentParams): Promise<ProviderPaymentResult>;

  verifyWebhook(
    payload: unknown,
    headers: Record<string, string>,
  ): Promise<WebhookVerificationResult>;

  queryTransaction(reference: string): Promise<ProviderTransactionStatus>;

  /** Placeholder — real refund in gateway integration phase. */
  refund(reference: string, amount?: string): Promise<RefundResult>;
}
