import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Job } from 'bullmq';
import { TOPUP_QUEUE_JOB } from '../entities/provider.constants';
import { TopupQueueJobData } from '../services/topup-queue.producer';
import { TopupService } from '../services/topup.service';

@Processor('topup_queue')
export class TopupWorker extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(TopupWorker.name);

  constructor(private readonly topupService: TopupService) {
    super();
  }

  onModuleInit() {
    this.logger.log('TopupWorker registered for topup_queue');
  }

  async process(job: Job<TopupQueueJobData>): Promise<void> {
    if (job.name === TOPUP_QUEUE_JOB.RETRY) {
      await this.topupService.retryFulfillment(job.data.orderId);
      return;
    }

    if (job.name === TOPUP_QUEUE_JOB.FULFILL) {
      await this.topupService.fulfillOrder(job.data.orderId);
      return;
    }

    this.logger.warn(`Unknown topup job: ${job.name}`);
  }
}
