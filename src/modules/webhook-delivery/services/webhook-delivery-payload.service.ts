import { Injectable } from '@nestjs/common';
import { FulfillmentStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { CardEncryptionService } from '../../provider/services/card-encryption.service';
import { AgentApiRepository } from '../../agent-api/repositories/agent-api.repository';
import {
  WEBHOOK_EVENT_VERSION,
  WEBHOOK_EVENTS,
  WebhookEventType,
} from '../entities/webhook-delivery.constants';
import { PartnerWebhookPayloadV1 } from '../entities/webhook-delivery.types';

@Injectable()
export class WebhookDeliveryPayloadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentApiRepository: AgentApiRepository,
    private readonly cardEncryption: CardEncryptionService,
  ) {}

  async resolveEvent(orderId: string): Promise<WebhookEventType | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { fulfillmentStatus: true, agentId: true },
    });
    if (!order?.agentId) return null;
    if (order.fulfillmentStatus === FulfillmentStatus.COMPLETED) {
      return WEBHOOK_EVENTS.ORDER_COMPLETED;
    }
    if (order.fulfillmentStatus === FulfillmentStatus.FAILED) {
      return WEBHOOK_EVENTS.ORDER_FAILED;
    }
    return null;
  }

  async buildPayload(orderId: string, event: WebhookEventType): Promise<PartnerWebhookPayloadV1 | null> {
    const order = await this.agentApiRepository.findOrderById(orderId);
    if (!order?.agentId) return null;

    const item = order.orderItems[0];
    const failureCode = await this.agentApiRepository.findLatestProviderFailureCode(orderId);
    const status =
      order.fulfillmentStatus === FulfillmentStatus.COMPLETED
        ? 'SUCCESS'
        : order.fulfillmentStatus === FulfillmentStatus.FAILED
          ? 'FAILED'
          : 'PROCESSING';

    const base: PartnerWebhookPayloadV1 = {
      version: WEBHOOK_EVENT_VERSION,
      event,
      request_id: order.agentRequestId ?? '',
      order_id: order.id,
      partner_order_id: order.agentRequestId ?? order.orderCode,
      status,
      product: item?.variant.sku,
      face_value: item ? Number(item.unitPrice) : undefined,
      amount: order.totalAmount.toFixed(2),
      created_at: order.createdAt.toISOString(),
      completed_at:
        order.fulfillmentStatus === FulfillmentStatus.COMPLETED
          ? order.updatedAt.toISOString()
          : undefined,
      gateway: 'wallet',
      provider: 'esale',
    };

    if (event === WEBHOOK_EVENTS.ORDER_COMPLETED && item?.cardRecords?.[0]) {
      const card = item.cardRecords[0];
      base.serial = this.cardEncryption.decrypt(card.encryptedSerial);
      base.pin = this.cardEncryption.decrypt(card.encryptedPin);
    }

    if (event === WEBHOOK_EVENTS.ORDER_FAILED) {
      base.error = {
        code: failureCode ?? 'PROVIDER_ERROR',
        message: 'Order fulfillment failed',
      };
    }

    return base;
  }
}
