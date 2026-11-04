import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ESIM_QUEUE, ESIM_QUEUE_JOB } from './esim.constants';

@Injectable()
export class EsimQueueProducer {
  private readonly logger = new Logger(EsimQueueProducer.name);

  constructor(@InjectQueue(ESIM_QUEUE) private readonly queue: Queue) {}

  /** Stable job id. Database openGuard is the real duplicate guard. */
  async enqueueFulfillment(orderId: string): Promise<string> {
    const jobId = `esim-fulfill-${orderId}`;
    try {
      const job = await this.queue.add(
        ESIM_QUEUE_JOB.FULFILL,
        { orderId },
        { jobId, attempts: 1 },
      );
      this.logger.log(`Enqueued esim_queue jobId=${job.id} orderId=${orderId}`);
      return String(job.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.toLowerCase().includes('job') && message.toLowerCase().includes('exist')) {
        return jobId;
      }
      throw error;
    }
  }

  /** Stable job id while waiting/active. Completed/failed jobs are removed so cron can retry GET. */
  async enqueueQueryOpen(orderId: string): Promise<string> {
    const jobId = `esim-query-open-${orderId}`;
    try {
      const job = await this.queue.add(
        ESIM_QUEUE_JOB.QUERY_OPEN,
        { orderId },
        { jobId, attempts: 1, removeOnComplete: true, removeOnFail: true },
      );
      this.logger.log(`Enqueued esim_queue jobId=${job.id} orderId=${orderId} kind=query_open`);
      return String(job.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.toLowerCase().includes('job') && message.toLowerCase().includes('exist')) {
        return jobId;
      }
      throw error;
    }
  }
}
