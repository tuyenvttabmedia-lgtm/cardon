import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';

import { Logger, OnModuleInit } from '@nestjs/common';

import { Job } from 'bullmq';

import {
  SystemActivityEventCategory,
  SystemActivityEventType,
  SystemActivitySeverity,
  SystemActivitySource,
} from '@prisma/client';

import { ActivityEventDispatcher } from '../../activity-event/activity-event-dispatcher.service';

import { PROVIDER_QUEUE_JOB } from '../entities/provider.constants';

import { providerQueueBackoffDelay } from '../entities/provider-retry.backoff';

import { ProviderQueueJobData } from '../services/provider-queue.producer';

import { ProviderService } from '../services/provider.service';



@Processor('provider_queue', {

  settings: {

    backoffStrategy: (attemptsMade: number) => providerQueueBackoffDelay(attemptsMade),

  },

})

export class ProviderWorker extends WorkerHost implements OnModuleInit {

  private readonly logger = new Logger(ProviderWorker.name);



  constructor(
    private readonly providerService: ProviderService,
    private readonly activityDispatcher: ActivityEventDispatcher,
  ) {

    super();

  }



  onModuleInit(): void {

    this.logger.log('ProviderWorker ready (6O22 retry backoff)');

  }



  async process(job: Job<ProviderQueueJobData>): Promise<void> {

    this.logger.log(

      `Processing ${job.name} orderId=${job.data.orderId} triggeredBy=${job.data.triggeredBy} queueJobId=${job.id}`,

    );



    if (job.name === PROVIDER_QUEUE_JOB.RETRY) {

      await this.providerService.retryFulfillment(job.data.orderId);

      return;

    }



    await this.providerService.fulfillOrder(job.data.orderId);

  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<ProviderQueueJobData>, error: Error): void {
    this.activityDispatcher.dispatch({
      eventType: SystemActivityEventType.QUEUE_FAILED,
      eventCategory: SystemActivityEventCategory.QUEUE,
      severity: SystemActivitySeverity.ERROR,
      source: SystemActivitySource.WORKER,
      resource: 'queue',
      resourceDisplay: job.queueName,
      title: 'Queue Job Failed',
      description: error.message,
      metadata: {
        queue: job.queueName,
        jobName: job.name,
        orderId: job.data.orderId,
        attemptsMade: job.attemptsMade,
      },
    });
  }

}


