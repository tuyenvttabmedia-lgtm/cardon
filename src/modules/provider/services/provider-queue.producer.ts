import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PROVIDER_QUEUE_JOB } from '../entities/provider.constants';

export interface ProviderQueueJobData {
  orderId: string;
  triggeredBy: 'webhook' | 'manual' | 'agent';
  attempt?: number;
}

@Injectable()
export class ProviderQueueProducer {
  private readonly logger = new Logger(ProviderQueueProducer.name);

  constructor(
    @InjectQueue('provider_queue') private readonly providerQueue: Queue,
  ) {}

  async enqueueFulfillment(
    orderId: string,
    triggeredBy: ProviderQueueJobData['triggeredBy'] = 'webhook',
  ): Promise<string> {
    const job = await this.providerQueue.add(
      PROVIDER_QUEUE_JOB.FULFILL,
      { orderId, triggeredBy, attempt: 1 },
      { jobId: `fulfill-${orderId}-${Date.now()}` },
    );
    this.logger.log(
      `Enqueued provider_queue jobId=${job.id} orderId=${orderId} triggeredBy=${triggeredBy}`,
    );
    return String(job.id);
  }

  async enqueueRetry(orderId: string, attempt: number): Promise<string> {
    const job = await this.providerQueue.add(
      PROVIDER_QUEUE_JOB.RETRY,
      { orderId, triggeredBy: 'manual', attempt },
      { jobId: `retry-${orderId}-${attempt}-${Date.now()}` },
    );
    this.logger.log(
      `Enqueued provider_queue retry jobId=${job.id} orderId=${orderId} attempt=${attempt}`,
    );
    return String(job.id);
  }

  async enqueueDelayedRetry(
    orderId: string,
    attempt: number,
    delayMs: number,
  ): Promise<string> {
    const job = await this.providerQueue.add(
      PROVIDER_QUEUE_JOB.RETRY,
      { orderId, triggeredBy: 'manual', attempt },
      {
        jobId: `retry-${orderId}-${attempt}-${Date.now()}`,
        delay: delayMs,
      },
    );
    this.logger.log(
      `Enqueued delayed provider_queue retry jobId=${job.id} orderId=${orderId} attempt=${attempt} delayMs=${delayMs}`,
    );
    return String(job.id);
  }
}
