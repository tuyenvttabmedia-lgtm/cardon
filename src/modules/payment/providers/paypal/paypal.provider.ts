import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentGatewayCode } from '@prisma/client';
import {
  CreateProviderPaymentParams,
  PaymentProviderInterface,
  ProviderPaymentResult,
  ProviderTransactionStatus,
  RefundResult,
  WebhookVerificationResult,
} from '../payment-provider.interface';

/**
 * PayPal stub for eSIM international only.
 * createPayment stays disabled until PAYPAL_ESIM_ENABLED=true and live credentials exist.
 * Does not touch MegaPay / SePay / card / topup flows.
 */
@Injectable()
export class PaypalProvider implements PaymentProviderInterface {
  readonly gateway = PaymentGatewayCode.PAYPAL;
  private readonly logger = new Logger(PaypalProvider.name);

  constructor(private readonly config: ConfigService) {}

  async createPayment(_params: CreateProviderPaymentParams): Promise<ProviderPaymentResult> {
    if (this.config.get<boolean>('paypal.esimEnabled') !== true) {
      throw new ForbiddenException('PayPal eSIM checkout is disabled');
    }
    throw new ForbiddenException('PayPal eSIM checkout is not live yet on this environment');
  }

  async verifyWebhook(
    payload: unknown,
    _headers: Record<string, string>,
  ): Promise<WebhookVerificationResult> {
    this.logger.warn('PayPal webhook stub invoked — not verifying');
    return {
      valid: false,
      paymentReference: '',
      status: 'PENDING',
      rawPayload: payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {},
    };
  }

  async queryTransaction(reference: string): Promise<ProviderTransactionStatus> {
    return {
      paymentReference: reference,
      status: 'PENDING',
      amount: '0',
    };
  }

  async refund(_reference: string, _amount?: string): Promise<RefundResult> {
    return {
      success: false,
      message: 'PayPal refund is manual-only after eSIM install secret is issued',
    };
  }
}
