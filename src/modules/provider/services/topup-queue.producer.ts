import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { TOPUP_QUEUE_JOB } from '../entities/provider.constants';

export interface TopupQueueJobData {
  orderId: string;
  triggeredBy: 'webhook' | 'manual' | 'agent';
  attempt?: number;
}

@Injectable()
export class TopupQueueProducer {
  private readonly logger = new Logger(TopupQueueProducer.name);

  constructor(@InjectQueue('topup_queue') private readonly topupQueue: Queue) {}

  async enqueueFulfillment(
    orderId: string,
    triggeredBy: TopupQueueJobData['triggeredBy'] = 'webhook',
  ): Promise<string> {
    const job = await this.topupQueue.add(
      TOPUP_QUEUE_JOB.FULFILL,
      { orderId, triggeredBy, attempt: 1 },
      { jobId: `topup-fulfill-${orderId}-${Date.now()}` },
    );
    this.logger.log(
      `Enqueued topup_queue jobId=${job.id} orderId=${orderId} triggeredBy=${triggeredBy}`,
    );
    return String(job.id);
  }

  async enqueueRetry(orderId: string, attempt: number): Promise<string> {
    const job = await this.topupQueue.add(
      TOPUP_QUEUE_JOB.RETRY,
      { orderId, triggeredBy: 'manual', attempt },
      { jobId: `topup-retry-${orderId}-${attempt}-${Date.now()}` },
    );
    this.logger.log(
      `Enqueued topup_queue retry jobId=${job.id} orderId=${orderId} attempt=${attempt}`,
    );
    return String(job.id);
  }

  /** Delayed checkTransaction-only recovery (never opens a new topup). */
  async enqueueDelayedCheck(
    orderId: string,
    attempt: number,
    delayMs: number,
  ): Promise<string> {
    const job = await this.topupQueue.add(
      TOPUP_QUEUE_JOB.RETRY,
      { orderId, triggeredBy: 'manual', attempt },
      {
        jobId: `topup-check-${orderId}-${attempt}-${Date.now()}`,
        delay: delayMs,
      },
    );
    this.logger.log(
      `Enqueued delayed topup check jobId=${job.id} orderId=${orderId} attempt=${attempt} delayMs=${delayMs}`,
    );
    return String(job.id);
  }
}
