import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import {
  SystemActivityEventCategory,
  SystemActivityEventType,
  SystemActivitySeverity,
  SystemActivitySource,
} from '@prisma/client';
import { Job } from 'bullmq';
import { ActivityEventDispatcher } from '../../activity-event/activity-event-dispatcher.service';
import {
  WEBHOOK_DELIVERY_JOB,
  WEBHOOK_DELIVERY_QUEUE,
  webhookDeliveryBackoffDelay,
} from '../entities/webhook-delivery.constants';
import { WebhookDeliveryJobData } from '../entities/webhook-delivery.types';
import { WebhookDeliveryService } from '../services/webhook-delivery.service';

@Processor(WEBHOOK_DELIVERY_QUEUE, {
  settings: {
    backoffStrategy: (attemptsMade: number) => webhookDeliveryBackoffDelay(attemptsMade),
  },
})
export class WebhookDeliveryWorker extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(WebhookDeliveryWorker.name);

  constructor(
    private readonly deliveryService: WebhookDeliveryService,
    private readonly activityDispatcher: ActivityEventDispatcher,
  ) {
    super();
  }

  onModuleInit(): void {
    this.logger.log('WebhookDeliveryWorker ready (6033.7 retry backoff)');
  }

  async process(job: Job<WebhookDeliveryJobData>): Promise<void> {
    const attemptNumber = job.data.manualRetry ? 1 : job.attemptsMade;
    this.logger.log(
      `Processing ${job.name} deliveryId=${job.data.deliveryId} attempt=${attemptNumber} queueJobId=${job.id}`,
    );

    if (job.name === WEBHOOK_DELIVERY_JOB.SEND) {
      await this.deliveryService.processDelivery(job.data.deliveryId, attemptNumber);
      return;
    }

    this.logger.warn(`Unknown webhook delivery job: ${job.name}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<WebhookDeliveryJobData>, error: Error): void {
    this.activityDispatcher.dispatch({
      eventType: SystemActivityEventType.QUEUE_FAILED,
      eventCategory: SystemActivityEventCategory.QUEUE,
      severity: SystemActivitySeverity.ERROR,
      source: SystemActivitySource.WORKER,
      resource: 'queue',
      resourceDisplay: WEBHOOK_DELIVERY_QUEUE,
      title: 'Webhook Delivery Job Failed',
      description: error.message,
      metadata: {
        queue: WEBHOOK_DELIVERY_QUEUE,
        jobName: job.name,
        deliveryId: job.data.deliveryId,
        attemptsMade: job.attemptsMade,
      },
    });
  }
}
