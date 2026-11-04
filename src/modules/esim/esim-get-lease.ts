import { Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';

export const ESIM_GET_LEASE_PREFIX = 'cardon:esim:get-lease:';

export const ESIM_QUERY_CLAIM_LEASE_PRESENT =
  'QUERY GET lease is present. The HTTP GET may still be running. Leave the claim SENT.';

export const ESIM_QUERY_CLAIM_LEASE_UNKNOWN =
  'Cannot inspect the QUERY GET lease. Leave the claim SENT.';

export const ESIM_QUERY_CLAIM_ABSENT_NOT_PROOF =
  'QUERY GET lease is absent; that is not proof the HTTP GET has stopped. Leave the claim SENT. Stop API and worker processes for this order and request a separate ops close.';

/** Compare-and-delete. ARGV[1] is the exact acquire payload. */
export const ESIM_GET_LEASE_RELEASE_LUA = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`;

export type EsimLeaseInspect = 'PRESENT' | 'ABSENT' | 'UNKNOWN';

export type EsimLeaseAcquire =
  | { ok: true; payload: string }
  | { ok: false; reason: 'conflict' | 'unverified' };

export type EsimLeaseRelease = 'released' | 'mismatch' | 'unverified';

export interface EsimLeaseMeta {
  orderId: string;
  orderItemId: string;
  queryAttemptId?: string;
}

export interface EsimLeaseRedis {
  set(key: string, value: string, nx: 'NX'): Promise<string | null>;
  get(key: string): Promise<string | null>;
  eval(script: string, numKeys: number, key: string, payload: string): Promise<unknown>;
}

type RedisConn = {
  set: (...args: unknown[]) => Promise<unknown>;
  get: (key: string) => Promise<string | null>;
  eval: (...args: unknown[]) => Promise<unknown>;
};

export function esimGetLeaseKey(createAttemptId: string): string {
  return `${ESIM_GET_LEASE_PREFIX}${createAttemptId}`;
}

export function encodeEsimLeasePayload(
  token: string,
  meta: EsimLeaseMeta & { createAttemptId: string },
): string {
  return JSON.stringify({
    token,
    createAttemptId: meta.createAttemptId,
    orderId: meta.orderId,
    orderItemId: meta.orderItemId,
    queryAttemptId: meta.queryAttemptId ?? null,
  });
}

export function esimLeaseRedisFromQueue(queue: Queue): EsimLeaseRedis {
  const conn = async (): Promise<RedisConn> => {
    const client = (await Promise.resolve(queue.client)) as unknown as RedisConn;
    return client;
  };
  return {
    async set(key, value, nx) {
      const result = await (await conn()).set(key, value, nx);
      return result == null ? null : String(result);
    },
    async get(key) {
      return (await conn()).get(key);
    },
    async eval(script, numKeys, key, payload) {
      return (await conn()).eval(script, numKeys, key, payload);
    },
  };
}

export class MemoryEsimLeaseRedis implements EsimLeaseRedis {
  readonly store = new Map<string, string>();
  failSet = false;
  failGet = false;
  failEval = false;

  async set(key: string, value: string, nx: 'NX'): Promise<string | null> {
    if (nx !== 'NX') {
      throw new Error('esim get lease SET must use NX');
    }
    if (this.failSet) {
      throw new Error('redis set failed');
    }
    if (this.store.has(key)) {
      return null;
    }
    this.store.set(key, value);
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    if (this.failGet) {
      throw new Error('redis get failed');
    }
    return this.store.get(key) ?? null;
  }

  async eval(_script: string, _numKeys: number, key: string, payload: string): Promise<unknown> {
    if (this.failEval) {
      throw new Error('redis eval failed');
    }
    if (this.store.get(key) === payload) {
      this.store.delete(key);
      return 1;
    }
    return 0;
  }
}

export class EsimGetLease {
  private readonly logger = new Logger(EsimGetLease.name);

  constructor(private readonly redis: EsimLeaseRedis) {}

  async acquire(createAttemptId: string, meta: EsimLeaseMeta): Promise<EsimLeaseAcquire> {
    const id = createAttemptId.trim();
    if (id === '') {
      return { ok: false, reason: 'unverified' };
    }
    const payload = encodeEsimLeasePayload(randomUUID(), {
      ...meta,
      createAttemptId: id,
    });
    let result: string | null;
    try {
      result = await this.redis.set(esimGetLeaseKey(id), payload, 'NX');
    } catch {
      this.logger.warn(`esim get lease acquire unverified createAttempt=${id}`);
      return { ok: false, reason: 'unverified' };
    }
    if (result === 'OK') {
      return { ok: true, payload };
    }
    if (result == null) {
      return { ok: false, reason: 'conflict' };
    }
    this.logger.warn(`esim get lease acquire unverified createAttempt=${id}`);
    return { ok: false, reason: 'unverified' };
  }

  async release(createAttemptId: string, payload: string): Promise<EsimLeaseRelease> {
    const id = createAttemptId.trim();
    if (id === '' || payload.trim() === '') {
      return 'unverified';
    }
    try {
      const deleted = await this.redis.eval(
        ESIM_GET_LEASE_RELEASE_LUA,
        1,
        esimGetLeaseKey(id),
        payload,
      );
      return Number(deleted) === 1 ? 'released' : 'mismatch';
    } catch {
      this.logger.warn(`esim get lease release unverified createAttempt=${id}`);
      return 'unverified';
    }
  }

  async inspect(createAttemptId: string): Promise<EsimLeaseInspect> {
    const id = createAttemptId.trim();
    if (id === '') {
      return 'UNKNOWN';
    }
    try {
      const value = await this.redis.get(esimGetLeaseKey(id));
      return value == null || value === '' ? 'ABSENT' : 'PRESENT';
    } catch {
      return 'UNKNOWN';
    }
  }
}
