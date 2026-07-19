import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  PaymentGatewayCode,
  SystemActivityEventCategory,
  SystemActivityEventType,
  SystemActivitySeverity,
  SystemActivitySource,
  WebhookSource,
} from '@prisma/client';
import { ActivityEventDispatcher } from '../../activity-event/activity-event-dispatcher.service';
import { PaymentProviderRegistry } from '../../payment/providers/payment-provider.registry';
import { WebhookLogRepository } from '../../payment/repositories/payment.repository';
import { isAgentDepositReference } from '../entities/deposit-reference.generator';
import { AgentDepositRepository } from '../repositories/agent-deposit.repository';
import { AgentDepositService } from './agent-deposit.service';

export interface AgentDepositWebhookResult {
  handled: boolean;
  ok?: boolean;
  duplicate?: boolean;
  paymentReference?: string;
}

@Injectable()
export class AgentDepositWebhookService {
  private readonly logger = new Logger(AgentDepositWebhookService.name);

  constructor(
    private readonly depositRepository: AgentDepositRepository,
    private readonly depositService: AgentDepositService,
    private readonly providerRegistry: PaymentProviderRegistry,
    private readonly webhookLogRepository: WebhookLogRepository,
    private readonly activityDispatcher: ActivityEventDispatcher,
  ) {}

  async tryHandle(
    gatewayParam: string,
    payload: unknown,
    headers: Record<string, string>,
    ipAddress?: string,
  ): Promise<AgentDepositWebhookResult> {
    const gateway = normalizeGatewayParam(gatewayParam);
    const provider = this.providerRegistry.get(gateway);
    const verification = await provider.verifyWebhook(payload, headers);

    if (!verification.paymentReference || !isAgentDepositReference(verification.paymentReference)) {
      return { handled: false };
    }

    const webhookSource = gateway === PaymentGatewayCode.MEGAPAY ? WebhookSource.MEGAPAY : WebhookSource.SEPAY;

    await this.webhookLogRepository.create({
      source: webhookSource,
      paymentReference: verification.paymentReference,
      payload: verification.rawPayload as object,
      signatureValid: verification.valid,
      ipAddress,
      processed: false,
    });

    if (!verification.valid) {
      this.activityDispatcher.dispatch({
        eventType: SystemActivityEventType.WEBHOOK_FAILED,
        eventCategory: SystemActivityEventCategory.WEBHOOK,
        severity: SystemActivitySeverity.ERROR,
        source: SystemActivitySource.API,
        resource: 'agent_deposit_webhook',
        resourceDisplay: gateway,
        title: 'Agent deposit webhook failed',
        description: 'Invalid webhook signature for agent deposit',
        ipAddress: ipAddress ?? null,
        metadata: { gateway, paymentReference: verification.paymentReference },
      });
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const deposit = await this.depositRepository.findByReference(verification.paymentReference);
    if (!deposit) {
      throw new NotFoundException('Agent deposit not found');
    }

    if (deposit.gateway !== gateway) {
      throw new BadRequestException(
        `Gateway mismatch: deposit is ${deposit.gateway}, webhook is ${gateway}`,
      );
    }

    if (verification.status === 'PENDING') {
      return {
        handled: true,
        ok: true,
        paymentReference: verification.paymentReference,
      };
    }

    if (verification.status !== 'SUCCESS') {
      await this.depositService.markDepositFailed(deposit.id, `Webhook status: ${verification.status}`);
      return {
        handled: true,
        ok: true,
        paymentReference: verification.paymentReference,
      };
    }

    const result = await this.depositService.processWebhookSuccess(deposit.id, {
      paymentReference: verification.paymentReference,
      amount: verification.amount,
      providerTransactionId: verification.providerTransactionId,
      rawPayload: verification.rawPayload,
    });

    return {
      handled: true,
      ok: true,
      duplicate: result.duplicate,
      paymentReference: verification.paymentReference,
    };
  }
}

function normalizeGatewayParam(gateway: string): PaymentGatewayCode {
  const upper = gateway.toUpperCase();
  if (upper === 'MEGAPAY' || upper === 'SEPAY') {
    return upper as PaymentGatewayCode;
  }
  throw new BadRequestException(`Unsupported gateway: ${gateway}`);
}
