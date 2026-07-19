import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  WEBHOOK_DELIVERY_JOB,
  WEBHOOK_DELIVERY_QUEUE,
} from '../entities/webhook-delivery.constants';
import { WebhookDeliveryJobData } from '../entities/webhook-delivery.types';

@Injectable()
export class WebhookDeliveryProducer {
  private readonly logger = new Logger(WebhookDeliveryProducer.name);

  constructor(
    @InjectQueue(WEBHOOK_DELIVERY_QUEUE)
    private readonly queue: Queue<WebhookDeliveryJobData>,
  ) {}

  async enqueueSend(deliveryId: string, manualRetry = false): Promise<void> {
    await this.queue.add(
      WEBHOOK_DELIVERY_JOB.SEND,
      { deliveryId, manualRetry },
      {
        jobId: manualRetry ? `wh-${deliveryId}-manual-${Date.now()}` : `wh-${deliveryId}`,
        removeOnComplete: true,
      },
    );
    this.logger.log(`Queued webhook delivery ${deliveryId} manual=${manualRetry}`);
  }
}
