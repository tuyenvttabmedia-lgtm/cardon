import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PaymentGatewayCode } from '@prisma/client';
import { SettingsStoreService } from '../../../settings/services/settings-store.service';
import {
  CreateProviderPaymentParams,
  PaymentProviderInterface,
  ProviderPaymentResult,
  ProviderTransactionStatus,
  RefundResult,
  WebhookVerificationResult,
} from '../payment-provider.interface';
import { PaypalApiError, PaypalClient } from './paypal.client';
import {
  evaluatePaypalCheckoutReady,
  parsePaypalWebhook,
  type PaypalObservation,
  type PaypalRuntimeConfig,
} from './paypal.rules';
import { storefrontCheckoutUrl } from '../../entities/storefront-checkout-url';

/**
 * PayPal Orders v2 for international eSIM (USD) only.
 * Customer create stays off until paypal.esimEnabled is set.
 * A failed call does not switch sandbox ↔ live.
 */
@Injectable()
export class PaypalProvider implements PaymentProviderInterface {
  readonly gateway = PaymentGatewayCode.PAYPAL;
  private readonly logger = new Logger(PaypalProvider.name);

  constructor(private readonly settings: SettingsStoreService) {}

  private client = new PaypalClient();

  /** Test seam. Production uses the sandbox or live host from config, never the other one. */
  useClient(client: PaypalClient): void {
    this.client = client;
  }

  async createPayment(params: CreateProviderPaymentParams): Promise<ProviderPaymentResult> {
    const config = this.runtimeConfig();
    const ready = evaluatePaypalCheckoutReady(config);
    if (!ready.ok) {
      if (ready.reason === 'DISABLED') {
        throw new ForbiddenException('PayPal eSIM checkout is disabled');
      }
      throw new BadRequestException(ready.reason);
    }
    if ((params.currency ?? 'USD').toUpperCase() !== 'USD') {
      throw new BadRequestException('PayPal eSIM payments are USD only');
    }

    const publicUrl = this.publicUrl();
    const amount = Number(params.amount).toFixed(2);
    const locale = params.locale === 'en' ? 'en' : 'vi';
    try {
      const created = await this.client.createOrder(config, {
        paymentReference: params.paymentReference,
        amount,
        returnUrl: storefrontCheckoutUrl(publicUrl, locale, '/checkout/paypal/return', {
          orderId: params.orderId,
        }),
        cancelUrl: storefrontCheckoutUrl(publicUrl, locale, '/checkout/paypal/cancel', {
          orderId: params.orderId,
        }),
      });
      this.logger.log(
        `PayPal order created mode=${config.mode} reference=${params.paymentReference} paypalOrderId=${created.orderId}`,
      );
      return {
        paymentUrl: created.approveUrl ?? '',
        providerReference: created.orderId,
        rawResponse: {
          paypalOrderId: created.orderId,
          captureState: 'CREATED',
          fulfillmentQueued: false,
          approvalUrl: created.approveUrl,
        },
      };
    } catch (error) {
      this.logger.warn(
        `PayPal create failed mode=${config.mode} reference=${params.paymentReference} reason=${error instanceof PaypalApiError ? error.issue : 'UNAVAILABLE'}`,
      );
      throw new BadRequestException('PayPal API error');
    }
  }

  async verifyWebhook(
    payload: unknown,
    headers: Record<string, string>,
  ): Promise<WebhookVerificationResult> {
    const config = this.runtimeConfig();
    const parsed = parsePaypalWebhook(payload);
    const valid = await this.client.verifyWebhookSignature(config, headers, payload);
    const rawPayload =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    if (!valid || !parsed) {
      return {
        valid: false,
        paymentReference: parsed?.paymentReference ?? '',
        status: 'PENDING',
        rawPayload,
      };
    }
    if (parsed.observation.kind === 'completed') {
      return {
        valid: true,
        paymentReference: parsed.paymentReference,
        status: 'SUCCESS',
        amount: parsed.observation.amount,
        providerTransactionId: parsed.observation.captureId,
        rawPayload: { ...rawPayload, paypalOrderId: parsed.orderId, captureId: parsed.observation.captureId },
      };
    }
    if (parsed.observation.kind === 'declined' || parsed.observation.kind === 'voided') {
      return {
        valid: true,
        paymentReference: parsed.paymentReference,
        status: 'FAILED',
        rawPayload: { ...rawPayload, paypalOrderId: parsed.orderId },
      };
    }
    return {
      valid: true,
      paymentReference: parsed.paymentReference,
      status: 'PENDING',
      rawPayload: {
        ...rawPayload,
        paypalEvent: parsed.eventType,
        paypalOrderId: parsed.orderId,
      },
    };
  }

  /**
   * Generic poll must not treat PayPal as paid. Confirmation is capture verification only.
   */
  async queryTransaction(reference: string): Promise<ProviderTransactionStatus> {
    return {
      paymentReference: reference,
      status: 'PENDING',
      amount: '0',
    };
  }

  async captureOrder(paypalOrderId: string, requestId: string): Promise<PaypalObservation> {
    return this.client.captureOrder(this.runtimeConfig(), paypalOrderId, requestId);
  }

  async readOrder(paypalOrderId: string): Promise<PaypalObservation> {
    return this.client.readOrder(this.runtimeConfig(), paypalOrderId);
  }

  async refund(_reference: string, _amount?: string): Promise<RefundResult> {
    return {
      success: false,
      message: 'PayPal refund is manual-only after eSIM install secret is issued',
    };
  }

  private runtimeConfig(): PaypalRuntimeConfig {
    const config = this.settings.resolvePaypalConfig();
    return {
      esimEnabled: config.esimEnabled,
      mode: config.mode,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      webhookId: config.webhookId,
    };
  }

  private publicUrl(): string {
    const url = this.settings.resolveSystemConfig().publicUrl?.replace(/\/$/, '') ?? '';
    if (!url) {
      throw new BadRequestException('APP_PUBLIC_URL is required for PayPal return URLs');
    }
    return url;
  }
}
