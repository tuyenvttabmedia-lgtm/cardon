import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PROVIDER_QUEUE_MAX_ATTEMPTS } from '../modules/provider/entities/provider-retry.backoff';
import { WEBHOOK_DELIVERY_MAX_ATTEMPTS } from '../modules/webhook-delivery/entities/webhook-delivery.constants';
import { QUEUE_NAMES } from './queue.constants';

const DEFAULT_JOB_OPTIONS = {
  removeOnComplete: 1000,
  removeOnFail: {
    age: 7 * 24 * 60 * 60,
    count: 5000,
  },
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 5000,
  },
};

const WEBHOOK_DELIVERY_QUEUE_JOB_OPTIONS = {
  ...DEFAULT_JOB_OPTIONS,
  attempts: WEBHOOK_DELIVERY_MAX_ATTEMPTS,
  backoff: {
    type: 'custom' as const,
  },
};

const PROVIDER_QUEUE_JOB_OPTIONS = {
  ...DEFAULT_JOB_OPTIONS,
  attempts: PROVIDER_QUEUE_MAX_ATTEMPTS,
  backoff: {
    type: 'custom' as const,
  },
};

function queueJobOptions(name: (typeof QUEUE_NAMES)[number]) {
  if (name === 'provider_queue') return PROVIDER_QUEUE_JOB_OPTIONS;
  if (name === 'webhook_delivery_queue') return WEBHOOK_DELIVERY_QUEUE_JOB_OPTIONS;
  return DEFAULT_JOB_OPTIONS;
}

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          url: configService.get<string>('redis.url'),
          maxRetriesPerRequest: null,
          enableReadyCheck: true,
          retryStrategy: (times: number) => Math.min(times * 200, 5000),
        },
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      }),
    }),
    ...QUEUE_NAMES.map((name) =>
      BullModule.registerQueue({
        name,
        defaultJobOptions: queueJobOptions(name),
      }),
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
