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

  /** Stable job id while waiting/active — see provider-queue.producer. */
  async enqueueFulfillment(
    orderId: string,
    triggeredBy: TopupQueueJobData['triggeredBy'] = 'webhook',
  ): Promise<string> {
    const jobId = `topup-fulfill-${orderId}`;
    try {
      const job = await this.topupQueue.add(
        TOPUP_QUEUE_JOB.FULFILL,
        { orderId, triggeredBy, attempt: 1 },
        { jobId, attempts: 1, removeOnComplete: true, removeOnFail: true },
      );
      this.logger.log(
        `Enqueued topup_queue jobId=${job.id} orderId=${orderId} triggeredBy=${triggeredBy}`,
      );
      return String(job.id);
    } catch (error) {
      if (isJobIdExistsError(error)) return jobId;
      throw error;
    }
  }

  async enqueueRetry(orderId: string, attempt: number): Promise<string> {
    const jobId = `topup-retry-${orderId}`;
    try {
      const job = await this.topupQueue.add(
        TOPUP_QUEUE_JOB.RETRY,
        { orderId, triggeredBy: 'manual', attempt },
        { jobId, attempts: 1, removeOnComplete: true, removeOnFail: true },
      );
      this.logger.log(
        `Enqueued topup_queue retry jobId=${job.id} orderId=${orderId} attempt=${attempt}`,
      );
      return String(job.id);
    } catch (error) {
      if (isJobIdExistsError(error)) return jobId;
      throw error;
    }
  }

  /** Delayed checkTransaction-only recovery (never opens a new topup). */
  async enqueueDelayedCheck(
    orderId: string,
    attempt: number,
    delayMs: number,
  ): Promise<string> {
    const jobId = `topup-check-${orderId}`;
    try {
      const job = await this.topupQueue.add(
        TOPUP_QUEUE_JOB.RETRY,
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
        `Enqueued delayed topup check jobId=${job.id} orderId=${orderId} attempt=${attempt} delayMs=${delayMs}`,
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
