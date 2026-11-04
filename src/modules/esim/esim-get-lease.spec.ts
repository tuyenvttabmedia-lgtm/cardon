import { Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ESIM_GET_LEASE_RELEASE_LUA,
  EsimGetLease,
  MemoryEsimLeaseRedis,
  encodeEsimLeasePayload,
  esimGetLeaseKey,
} from './esim-get-lease';

const root = join(__dirname, '../../..');
const meta = { orderId: 'order-1', orderItemId: 'item-1', queryAttemptId: 'query-1' };

describe('LPA-16K27B Redis GET lease helper', () => {
  it('acquires with SET NX and no TTL steal', async () => {
    const source = readFileSync(join(root, 'src/modules/esim/esim-get-lease.ts'), 'utf8');
    expect(source).toContain("set(esimGetLeaseKey(id), payload, 'NX')");
    expect(source).not.toMatch(/\bEX\b|\bPX\b|\bEXAT\b|\bPXAT\b/);
    expect(source).not.toContain('steal');
    const redis = new MemoryEsimLeaseRedis();
    const lease = new EsimGetLease(redis);
    const first = await lease.acquire('attempt-1', meta);
    const second = await lease.acquire('attempt-1', meta);
    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, reason: 'conflict' });
    expect(redis.store.has(esimGetLeaseKey('attempt-1'))).toBe(true);
    expect(JSON.parse([...redis.store.values()][0] as string).token).toEqual(
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
  });

  it('releases only through compare-token Lua, not GET then DEL', async () => {
    expect(ESIM_GET_LEASE_RELEASE_LUA).toContain('redis.call("GET", KEYS[1]) == ARGV[1]');
    expect(ESIM_GET_LEASE_RELEASE_LUA).toContain('redis.call("DEL", KEYS[1])');
    const redis = new MemoryEsimLeaseRedis();
    const evalSpy = jest.spyOn(redis, 'eval');
    const getSpy = jest.spyOn(redis, 'get');
    const lease = new EsimGetLease(redis);
    const acquired = await lease.acquire('attempt-1', meta);
    expect(acquired.ok).toBe(true);
    if (!acquired.ok) return;
    await expect(lease.release('attempt-1', acquired.payload)).resolves.toBe('released');
    expect(evalSpy).toHaveBeenCalledWith(
      ESIM_GET_LEASE_RELEASE_LUA,
      1,
      esimGetLeaseKey('attempt-1'),
      acquired.payload,
    );
    expect(getSpy).not.toHaveBeenCalled();
    expect(redis.store.size).toBe(0);
  });

  it('does not let an old owner delete a newer lease', async () => {
    const redis = new MemoryEsimLeaseRedis();
    const lease = new EsimGetLease(redis);
    const oldOwner = await lease.acquire('attempt-1', meta);
    expect(oldOwner.ok).toBe(true);
    if (!oldOwner.ok) return;
    redis.store.set(
      esimGetLeaseKey('attempt-1'),
      encodeEsimLeasePayload('new-token', { ...meta, createAttemptId: 'attempt-1' }),
    );
    await expect(lease.release('attempt-1', oldOwner.payload)).resolves.toBe('mismatch');
    expect(JSON.parse(redis.store.get(esimGetLeaseKey('attempt-1')) as string).token).toBe(
      'new-token',
    );
  });

  it('inspects PRESENT, ABSENT, and UNKNOWN on Redis errors', async () => {
    const redis = new MemoryEsimLeaseRedis();
    const lease = new EsimGetLease(redis);
    await expect(lease.inspect('attempt-1')).resolves.toBe('ABSENT');
    await lease.acquire('attempt-1', meta);
    await expect(lease.inspect('attempt-1')).resolves.toBe('PRESENT');
    redis.failGet = true;
    await expect(lease.inspect('attempt-1')).resolves.toBe('UNKNOWN');
    await expect(lease.inspect('   ')).resolves.toBe('UNKNOWN');
  });

  it('fails closed when acquire Redis errors or returns an unknown result', async () => {
    const redis = new MemoryEsimLeaseRedis();
    const lease = new EsimGetLease(redis);
    redis.failSet = true;
    await expect(lease.acquire('attempt-1', meta)).resolves.toEqual({
      ok: false,
      reason: 'unverified',
    });
    redis.failSet = false;
    redis.set = async () => 'QUEUED';
    await expect(lease.acquire('attempt-1', meta)).resolves.toEqual({
      ok: false,
      reason: 'unverified',
    });
    redis.failEval = true;
    const okRedis = new MemoryEsimLeaseRedis();
    const okLease = new EsimGetLease(okRedis);
    const held = await okLease.acquire('attempt-2', meta);
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    okRedis.failEval = true;
    await expect(okLease.release('attempt-2', held.payload)).resolves.toBe('unverified');
    expect(okRedis.store.has(esimGetLeaseKey('attempt-2'))).toBe(true);
  });

  it('does not log the owner token or install secrets', async () => {
    const messages: string[] = [];
    const spy = jest.spyOn(Logger.prototype, 'warn').mockImplementation((message) => {
      messages.push(String(message));
    });
    const redis = new MemoryEsimLeaseRedis();
    redis.failSet = true;
    await new EsimGetLease(redis).acquire('attempt-1', meta);
    spy.mockRestore();
    const joined = messages.join('\n');
    expect(joined).toContain('createAttempt=attempt-1');
    expect(joined).not.toMatch(/LPA:1\$|installSecret|qrcode=/i);
    expect(joined).not.toContain('"token"');
  });

  it('close-claim source treats ABSENT as insufficient proof', () => {
    const admin = readFileSync(join(root, 'src/modules/esim/esim-admin.service.ts'), 'utf8');
    const start = admin.indexOf('async closeSentQueryClaim');
    const body = admin.slice(start, admin.indexOf('export function pickEsimLastError'));
    expect(body).toContain('getLease.inspect');
    expect(body).toContain('ESIM_QUERY_CLAIM_ABSENT_NOT_PROOF');
    expect(body).not.toContain('$transaction');
    const fulfill = readFileSync(join(root, 'src/modules/esim/esim-fulfillment.service.ts'), 'utf8');
    const run = fulfill.slice(
      fulfill.indexOf('private async runInstallGet'),
      fulfill.indexOf('private async readInstallFromProvider'),
    );
    expect(run).toContain('await run()');
    expect(run).toContain('finally');
    expect(run).toContain('release');
    expect(run).not.toContain('Promise.race');
  });
});
