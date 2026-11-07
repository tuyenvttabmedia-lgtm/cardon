import { readFileSync } from 'fs';
import { join } from 'path';
import { BadRequestException } from '@nestjs/common';
import {
  ESIM_QUERY_CLAIM_BUSY,
  ESIM_QUERY_CLAIM_UNVERIFIED,
  EsimQueryActivityProbe,
} from './esim-query-activity.probe';
import { esimFulfillJobId, esimQueryOpenJobId } from './esim.constants';

const root = join(__dirname, '../../..');

function probeWith(
  jobs: Record<string, { getState: () => Promise<string> } | null>,
  getJobImpl?: (id: string) => Promise<unknown>,
) {
  const queue = {
    getJob:
      getJobImpl ??
      (async (id: string) => jobs[id] ?? null),
  };
  return new EsimQueryActivityProbe(queue as never);
}

describe('EsimQueryActivityProbe', () => {
  it('uses the same job ids as the queue producer', () => {
    const producer = readFileSync(join(root, 'src/modules/esim/esim-queue.producer.ts'), 'utf8');
    expect(producer).toContain('const jobId = `esim-fulfill-${orderId}`');
    expect(producer).toContain('const jobId = `esim-query-open-${orderId}`');
    expect(esimFulfillJobId('order-1')).toBe('esim-fulfill-order-1');
    expect(esimQueryOpenJobId('order-1')).toBe('esim-query-open-order-1');
  });

  it('does not use heartbeat age as evidence', () => {
    const source = readFileSync(join(root, 'src/modules/esim/esim-query-activity.probe.ts'), 'utf8');
    expect(source).not.toContain('WORKER_HEARTBEAT');
    expect(source).not.toContain('cardon:worker:heartbeat');
    expect(source).not.toContain('createOrder');
    expect(source).not.toContain('enqueue');
  });

  it('admin close verifies idle then inspects the GET lease and never auto-closes', () => {
    const source = readFileSync(join(root, 'src/modules/esim/esim-admin.service.ts'), 'utf8');
    const start = source.indexOf('async closeSentQueryClaim');
    const body = source.slice(start, source.indexOf('export function pickEsimLastError'));
    expect(body).toContain('queryActivity.assertIdle');
    expect(body).toContain('ESIM_QUERY_CLAIM_UNVERIFIED');
    expect(body).toContain('getLease.inspect');
    expect(body).toContain('ESIM_QUERY_CLAIM_ABSENT_NOT_PROOF');
    expect(body).not.toContain('$transaction');
    expect(body).not.toContain('createOrder');
    expect(body).not.toContain('fulfill(');
    expect(body).not.toContain('/v2/orders');
  });

  it('allows close when both jobs are absent or completed', async () => {
    await expect(probeWith({}).assertIdle('order-1')).resolves.toBeUndefined();
    await expect(
      probeWith({
        [esimQueryOpenJobId('order-1')]: { getState: async () => 'completed' },
        [esimFulfillJobId('order-1')]: { getState: async () => 'failed' },
      }).assertIdle('order-1'),
    ).resolves.toBeUndefined();
  });

  it('refuses when a QUERY_OPEN or FULFILL job is still busy', async () => {
    await expect(
      probeWith({
        [esimQueryOpenJobId('order-1')]: { getState: async () => 'active' },
      }).assertIdle('order-1'),
    ).rejects.toThrow(ESIM_QUERY_CLAIM_BUSY);
    await expect(
      probeWith({
        [esimFulfillJobId('order-1')]: { getState: async () => 'waiting' },
      }).assertIdle('order-1'),
    ).rejects.toThrow(ESIM_QUERY_CLAIM_BUSY);
  });

  it('refuses when Redis or job state cannot be read', async () => {
    await expect(
      probeWith({}, async () => {
        throw new Error('redis down');
      }).assertIdle('order-1'),
    ).rejects.toThrow(ESIM_QUERY_CLAIM_UNVERIFIED);
    await expect(
      probeWith({
        [esimQueryOpenJobId('order-1')]: {
          getState: async () => {
            throw new Error('state missing');
          },
        },
      }).assertIdle('order-1'),
    ).rejects.toThrow(ESIM_QUERY_CLAIM_UNVERIFIED);
  });

  it('refuses a blank order id without touching the queue', async () => {
    const getJob = jest.fn();
    await expect(probeWith({}, getJob).assertIdle('   ')).rejects.toBeInstanceOf(BadRequestException);
    expect(getJob).not.toHaveBeenCalled();
  });
});
