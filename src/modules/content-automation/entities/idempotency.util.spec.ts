import {
  buildBullMqJobId,
  buildIdempotencyKey,
} from './idempotency.util';
import { AiTaskType } from '@prisma/client';

describe('idempotency.util', () => {
  const planId = '11111111-1111-1111-1111-111111111111';
  const task = AiTaskType.OUTLINE;
  const epoch = 2;

  it('builds canonical idempotency key', () => {
    expect(buildIdempotencyKey(planId, task, epoch)).toBe(
      `${planId}:${task}:${epoch}`,
    );
  });

  it('builds BullMQ job id', () => {
    expect(buildBullMqJobId(planId, task, epoch)).toBe(
      `content-${planId}-${task}-${epoch}`,
    );
  });

  it('does not use legacy contentVersion or attemptKey naming', () => {
    const jobId = buildBullMqJobId(planId, task, epoch);
    expect(jobId).not.toContain('contentVersion');
    expect(jobId).not.toContain('attemptKey');
  });
});
