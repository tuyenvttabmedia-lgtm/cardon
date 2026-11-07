import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ESIM_QUEUE } from './esim.constants';
import { EsimGetLease, esimLeaseRedisFromQueue } from './esim-get-lease';
import { EsimQueryActivityProbe } from './esim-query-activity.probe';
import { EsimQueueProducer } from './esim-queue.producer';

/** Queue-only module so provider dispatch can enqueue eSIM without importing order flow. */
@Module({
  imports: [BullModule.registerQueue({ name: ESIM_QUEUE })],
  providers: [
    EsimQueueProducer,
    EsimQueryActivityProbe,
    {
      provide: EsimGetLease,
      useFactory: (queue: Queue) => new EsimGetLease(esimLeaseRedisFromQueue(queue)),
      inject: [getQueueToken(ESIM_QUEUE)],
    },
  ],
  exports: [EsimQueueProducer, EsimQueryActivityProbe, EsimGetLease],
})
export class EsimQueueModule {}
