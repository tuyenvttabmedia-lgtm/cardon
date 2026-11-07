import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ESIM_QUEUE, esimFulfillJobId, esimQueryOpenJobId } from './esim.constants';

/** Job still owns the GET/query path. Do not treat heartbeat TTL as evidence. */
export const ESIM_QUERY_BUSY_STATES = new Set([
  'active',
  'waiting',
  'delayed',
  'paused',
  'waiting-children',
  'prioritized',
]);

export const ESIM_QUERY_CLAIM_UNVERIFIED =
  'Cannot verify the QUERY request has stopped. Inspect esim_queue for esim-query-open-* / esim-fulfill-* and retry only after the job has left active/waiting. Do not use a timeout as proof.';

export const ESIM_QUERY_CLAIM_BUSY =
  'QUERY request may still be running. Wait until esim-query-open-* and esim-fulfill-* leave active/waiting. Do not close the claim while GET is in flight.';

@Injectable()
export class EsimQueryActivityProbe {
  constructor(@InjectQueue(ESIM_QUEUE) private readonly queue: Queue) {}

  /**
   * Fail-closed: a Redis/queue error or a busy job blocks the close.
   * Heartbeat age is not used.
   */
  async assertIdle(orderId: string): Promise<void> {
    const id = orderId.trim();
    if (id === '') {
      throw new BadRequestException(ESIM_QUERY_CLAIM_UNVERIFIED);
    }
    let queryJob;
    let fulfillJob;
    try {
      [queryJob, fulfillJob] = await Promise.all([
        this.queue.getJob(esimQueryOpenJobId(id)),
        this.queue.getJob(esimFulfillJobId(id)),
      ]);
    } catch {
      throw new BadRequestException(ESIM_QUERY_CLAIM_UNVERIFIED);
    }
    for (const job of [queryJob, fulfillJob]) {
      if (!job) continue;
      let state: string;
      try {
        state = await job.getState();
      } catch {
        throw new BadRequestException(ESIM_QUERY_CLAIM_UNVERIFIED);
      }
      if (ESIM_QUERY_BUSY_STATES.has(state)) {
        throw new BadRequestException(ESIM_QUERY_CLAIM_BUSY);
      }
    }
  }
}
