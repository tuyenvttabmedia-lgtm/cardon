import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ESIM_QUEUE, ESIM_QUEUE_JOB } from './esim.constants';
import { EsimFulfillmentService } from './esim-fulfillment.service';

@Processor(ESIM_QUEUE, { concurrency: 1 })
export class EsimWorker extends WorkerHost {
  private readonly logger = new Logger(EsimWorker.name);

  constructor(private readonly fulfillment: EsimFulfillmentService) {
    super();
  }

  async process(job: Job<{ orderId: string }>): Promise<void> {
    if (job.name === ESIM_QUEUE_JOB.QUERY_OPEN) {
      const recovered = await this.fulfillment.queryOpenCreateRecovery(job.data.orderId);
      this.logger.log(
        `esim_queue job ${job.id} orderId=${recovered.orderId} status=${recovered.fulfillmentStatus} kind=query_open`,
      );
      return;
    }
    if (job.name !== ESIM_QUEUE_JOB.FULFILL) {
      return;
    }
    const result = await this.fulfillment.fulfill(job.data.orderId);
    // query() returns before any provider read unless this order has a stored LIVE reference.
    await this.fulfillment.query(job.data.orderId);
    this.logger.log(
      `esim_queue job ${job.id} orderId=${result.orderId} status=${result.fulfillmentStatus}`,
    );
  }
}
