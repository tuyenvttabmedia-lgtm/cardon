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

  /**
   * Stable job id while waiting/active (like eSIM). Completed/failed jobs are removed
   * so late webhooks can re-enqueue; DB claim still blocks double-buy.
   */
  async enqueueFulfillment(
    orderId: string,
    triggeredBy: ProviderQueueJobData['triggeredBy'] = 'webhook',
  ): Promise<string> {
    const jobId = `fulfill-${orderId}`;
    try {
      const job = await this.providerQueue.add(
        PROVIDER_QUEUE_JOB.FULFILL,
        { orderId, triggeredBy, attempt: 1 },
        { jobId, attempts: 1, removeOnComplete: true, removeOnFail: true },
      );
      this.logger.log(
        `Enqueued provider_queue jobId=${job.id} orderId=${orderId} triggeredBy=${triggeredBy}`,
      );
      return String(job.id);
    } catch (error) {
      if (isJobIdExistsError(error)) return jobId;
      throw error;
    }
  }

  async enqueueRetry(orderId: string, attempt: number): Promise<string> {
    const jobId = `retry-${orderId}-${attempt}`;
    try {
      const job = await this.providerQueue.add(
        PROVIDER_QUEUE_JOB.RETRY,
        { orderId, triggeredBy: 'manual', attempt },
        { jobId, attempts: 1, removeOnComplete: true, removeOnFail: true },
      );
      this.logger.log(
        `Enqueued provider_queue retry jobId=${job.id} orderId=${orderId} attempt=${attempt}`,
      );
      return String(job.id);
    } catch (error) {
      if (isJobIdExistsError(error)) return jobId;
      throw error;
    }
  }

  async enqueueDelayedRetry(
    orderId: string,
    attempt: number,
    delayMs: number,
  ): Promise<string> {
    const jobId = `retry-${orderId}-${attempt}`;
    try {
      const job = await this.providerQueue.add(
        PROVIDER_QUEUE_JOB.RETRY,
        { orderId, triggeredBy: 'manual', attempt },
        {
          jobId,
          delay: delayMs,
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
      this.logger.log(
        `Enqueued delayed provider_queue retry jobId=${job.id} orderId=${orderId} attempt=${attempt} delayMs=${delayMs}`,
      );
      return String(job.id);
    } catch (error) {
      if (isJobIdExistsError(error)) return jobId;
      throw error;
    }
  }
}

function isJobIdExistsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  return message.toLowerCase().includes('job') && message.toLowerCase().includes('exist');
}
