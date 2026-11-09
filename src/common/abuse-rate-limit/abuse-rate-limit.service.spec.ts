import { HttpException, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { AbuseRateLimitService } from './abuse-rate-limit.service';
import { ABUSE_INCR_EXPIRE_LUA } from './abuse-rate-limit.constants';

describe('AbuseRateLimitService', () => {
  function build(evalImpl: jest.Mock, enabled = true) {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'abuseRateLimit.enabled') return enabled;
        if (key === 'abuseRateLimit.redisUrl') return 'redis://localhost:6379';
        if (key === 'abuseRateLimit.commandTimeoutMs') return 100;
        if (key === 'redis.url') return 'redis://localhost:6379';
        return undefined;
      }),
    };
    const service = new AbuseRateLimitService(config as never);
    const client = {
      eval: evalImpl,
      quit: jest.fn(),
    };
    service.setClientForTests(client as never);
    return service;
  }

  it('allows under limit across dimensions', async () => {
    const evalImpl = jest.fn().mockResolvedValue(1);
    const service = build(evalImpl);
    await expect(
      service.consumeOrThrow({
        bucket: 'auth_register',
        ip: '1.2.3.4',
        email: 'a@gmail.com',
      }),
    ).resolves.toBeUndefined();
    expect(evalImpl).toHaveBeenCalledTimes(2);
    expect(evalImpl.mock.calls[0][0]).toBe(ABUSE_INCR_EXPIRE_LUA);
  });

  it('returns 429 when any dimension exceeds limit', async () => {
    const evalImpl = jest
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(6);
    const service = build(evalImpl);
    await expect(
      service.consumeOrThrow({
        bucket: 'auth_register',
        ip: '1.2.3.4',
        email: 'a@gmail.com',
      }),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
  });

  it('fail-closed with 503 on Redis error', async () => {
    const evalImpl = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const service = build(evalImpl);
    await expect(
      service.consumeOrThrow({ bucket: 'auth_login', ip: '1.2.3.4' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(service.getMetrics().redisErrorCount).toBe(1);
  });

  it('no-ops when disabled', async () => {
    const evalImpl = jest.fn();
    const service = build(evalImpl, false);
    await service.consumeOrThrow({ bucket: 'auth_login', ip: '1.2.3.4' });
    expect(evalImpl).not.toHaveBeenCalled();
  });

  it('INCR script returns growing counters (TTL set on first hit)', async () => {
    let n = 0;
    const evalImpl = jest.fn(async () => {
      n += 1;
      return n;
    });
    const service = build(evalImpl);
    expect(await service.incr('support_upload', 'userId', 'u1', 3600)).toBe(1);
    expect(await service.incr('support_upload', 'userId', 'u1', 3600)).toBe(2);
  });

  it('throws HttpException 429 type for over limit', async () => {
    const evalImpl = jest.fn().mockResolvedValue(99);
    const service = build(evalImpl);
    try {
      await service.consumeOrThrow({ bucket: 'support_upload', userId: 'u1' });
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(429);
    }
  });

  it('consumeFailOpen still 429 when over limit', async () => {
    const evalImpl = jest.fn().mockResolvedValue(99);
    const service = build(evalImpl);
    await expect(
      service.consumeFailOpen({ bucket: 'order_create', ip: '1.2.3.4' }),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
  });

  it('consumeFailOpen allows request when Redis errors', async () => {
    const evalImpl = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const service = build(evalImpl);
    await expect(
      service.consumeFailOpen({
        bucket: 'order_create',
        ip: '1.2.3.4',
        email: 'a@gmail.com',
      }),
    ).resolves.toBeUndefined();
    expect(service.getMetrics().redisErrorCount).toBe(1);
  });
});
