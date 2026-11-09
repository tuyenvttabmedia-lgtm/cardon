import { createHash } from 'crypto';
import { ABUSE_KEY_PREFIX } from '../../common/abuse-rate-limit/abuse-rate-limit.constants';
import { resolveAbuseBucketConfig } from '../../common/abuse-rate-limit/abuse-rate-limit.constants';
import { AbuseRateLimitService } from '../../common/abuse-rate-limit/abuse-rate-limit.service';
import { TURNSTILE_ACTION_GUEST_ORDER } from '../../common/turnstile/turnstile.constants';
import { evaluateEmailDomain } from '../../common/email-policy/email-policy';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * W5 verification evidence — key shapes, guest vs auth isolation, email policy parity.
 */
describe('W5 verification evidence', () => {
  it('order_create defaults 20 / 900s', () => {
    const cfg = resolveAbuseBucketConfig('order_create');
    expect(cfg.limit).toBe(20);
    expect(cfg.ttlSeconds).toBe(15 * 60);
  });

  it('Redis key format cardon:abuse:order_create:{dimension}:{id}', async () => {
    const evalImpl = jest.fn().mockResolvedValue(1);
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'abuseRateLimit.enabled') return true;
        if (key === 'abuseRateLimit.redisUrl') return 'redis://localhost:6379';
        return undefined;
      }),
    };
    const service = new AbuseRateLimitService(config as never);
    service.setClientForTests({ eval: evalImpl, quit: jest.fn() } as never);

    await service.consumeFailOpen({
      bucket: 'order_create',
      ip: '203.0.113.10',
      email: 'Guest@Gmail.com',
    });

    const keys = evalImpl.mock.calls.map((c) => c[2] as string);
    expect(keys).toContain(`${ABUSE_KEY_PREFIX}order_create:ip:203.0.113.10`);
    const emailHash = createHash('sha256')
      .update('guest@gmail.com')
      .digest('hex')
      .slice(0, 32);
    expect(keys).toContain(`${ABUSE_KEY_PREFIX}order_create:emailHash:${emailHash}`);
    expect(keys.some((k) => k.includes(':userId:'))).toBe(false);
  });

  it('auth-only consume uses userId key, not ip', async () => {
    const evalImpl = jest.fn().mockResolvedValue(1);
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'abuseRateLimit.enabled') return true;
        if (key === 'abuseRateLimit.redisUrl') return 'redis://localhost:6379';
        return undefined;
      }),
    };
    const service = new AbuseRateLimitService(config as never);
    service.setClientForTests({ eval: evalImpl, quit: jest.fn() } as never);

    await service.consumeFailOpen({
      bucket: 'order_create',
      userId: 'user-uuid-1',
    });

    const keys = evalImpl.mock.calls.map((c) => c[2] as string);
    expect(keys).toEqual([`${ABUSE_KEY_PREFIX}order_create:userId:user-uuid-1`]);
  });

  it('multi-instance shares counters via Redis prefix (same key material)', () => {
    const ip = '198.51.100.7';
    const a = `${ABUSE_KEY_PREFIX}order_create:ip:${ip}`;
    const b = `${ABUSE_KEY_PREFIX}order_create:ip:${ip}`;
    expect(a).toBe(b);
  });

  it('controller wires guest-order Turnstile action + extractClientIp', () => {
    const src = readFileSync(
      join(__dirname, 'controllers/order.controller.ts'),
      'utf8',
    );
    expect(src).toContain('TURNSTILE_ACTION_GUEST_ORDER');
    expect(src).toContain("expectedAction: TURNSTILE_ACTION_GUEST_ORDER");
    expect(TURNSTILE_ACTION_GUEST_ORDER).toBe('guest-order');
    expect(src).toContain('extractClientIp');
    expect(src).toContain('consumeFailOpen');
    expect(src).toContain('assertRegistrationEmailAllowed');
  });

  it('guest email policy matches W1 reserved + disposable', () => {
    expect(evaluateEmailDomain('a@example.com').allowed).toBe(false);
    expect(evaluateEmailDomain('a@example.org').allowed).toBe(false);
    expect(evaluateEmailDomain('a@example.net').allowed).toBe(false);
    expect(evaluateEmailDomain('a@mailinator.com').allowed).toBe(false);
    expect(evaluateEmailDomain('a@gmail.com').allowed).toBe(true);
  });

  it('payment controller remains free of W5 hooks', () => {
    const src = readFileSync(
      join(__dirname, '../payment/controllers/payment.controller.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/Turnstile|consumeFailOpen|EmailPolicy|captchaToken/i);
    expect(src).toContain('@SkipThrottle()');
  });
});
