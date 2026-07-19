import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { NOTIFICATION_JOB } from '../entities/notification.constants';
import { sanitizeNotificationLogContext } from '../entities/notification-log-safety';
import { NotificationQueueJobData } from '../entities/notification.types';
import { NotificationDispatchService } from '../services/notification-dispatch.service';

@Processor('notification_queue')
export class NotificationWorker extends WorkerHost {
  private readonly logger = new Logger(NotificationWorker.name);

  constructor(private readonly dispatchService: NotificationDispatchService) {
    super();
  }

  async process(job: Job<NotificationQueueJobData>): Promise<void> {
    if (job.name !== NOTIFICATION_JOB.SEND) {
      this.logger.warn(`Unknown notification job: ${job.name}`);
      return;
    }

    this.logger.log(
      sanitizeNotificationLogContext({
        channel: job.data.channel,
        template: job.data.template,
        systemType: job.data.systemType,
        attempt: job.attemptsMade + 1,
      }),
    );

    try {
      await this.dispatchService.dispatch(job.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Notification failed';
      this.logger.warn(
        sanitizeNotificationLogContext({
          error: message,
          template: job.data.template,
          attempt: job.attemptsMade + 1,
        }),
      );
      throw error;
    }
  }
}
