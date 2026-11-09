import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CAPTCHA_USED_KEY_PREFIX } from './turnstile.constants';
import { TurnstileService } from './turnstile.service';

describe('TurnstileService', () => {
  const secret = 'test-secret';
  let claimKeyOnce: jest.Mock;
  let fetchMock: jest.Mock;
  let loggerError: jest.SpyInstance;
  let loggerWarn: jest.SpyInstance;
  let resolveTurnstile: jest.Mock;

  function build(
    resolvedOverrides: Record<string, unknown> = {},
    configOverrides: Record<string, unknown> = {},
  ) {
    const values: Record<string, unknown> = {
      'turnstile.timeoutMs': 4000,
      'turnstile.maxAgeSec': 300,
      'turnstile.replayEnabled': true,
      ...configOverrides,
    };
    const config = {
      get: jest.fn((key: string) => values[key]),
    };
    claimKeyOnce = jest.fn().mockResolvedValue(true);
    const abuse = { claimKeyOnce };
    resolveTurnstile = jest.fn().mockReturnValue({
      enabled: true,
      siteKey: 'site',
      secretKey: secret,
      allowedHostnames: 'cardon.vn,www.cardon.vn',
      source: 'database',
      ready: true,
      ...resolvedOverrides,
    });
    const settingsStore = { resolveTurnstile };
    const service = new TurnstileService(
      config as never,
      abuse as never,
      settingsStore as never,
    );
    loggerError = jest.spyOn((service as any).logger, 'error').mockImplementation();
    loggerWarn = jest.spyOn((service as any).logger, 'warn').mockImplementation();
    return service;
  }

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function okBody(partial: Record<string, unknown> = {}) {
    return {
      success: true,
      hostname: 'cardon.vn',
      action: 'register',
      challenge_ts: new Date().toISOString(),
      ...partial,
    };
  }

  function mockJson(body: unknown, status = 200) {
    fetchMock.mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    });
  }

  it('1) flag OFF → no token required, no fetch', async () => {
    const service = build({ enabled: false, ready: false, secretKey: '' });
    await expect(service.verifyOrThrow({})).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(claimKeyOnce).not.toHaveBeenCalled();
  });

  it('2) flag ON, missing token → 400', async () => {
    const service = build();
    await expect(service.verifyOrThrow({ token: '' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('3) siteverify success → continues and claims replay', async () => {
    const service = build();
    mockJson(okBody());
    await service.verifyOrThrow({
      token: 'tok-ok',
      remoteIp: '1.2.3.4',
      expectedAction: 'register',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = String(init.body);
    expect(body).toContain('secret=test-secret');
    expect(body).toContain('response=tok-ok');
    expect(body).toContain('remoteip=1.2.3.4');
    expect(claimKeyOnce).toHaveBeenCalledTimes(1);
    const [key] = claimKeyOnce.mock.calls[0];
    expect(key.startsWith(CAPTCHA_USED_KEY_PREFIX)).toBe(true);
    expect(key).not.toContain('tok-ok');
  });

  it('4) success=false → 400', async () => {
    const service = build();
    mockJson({ success: false, 'error-codes': ['invalid-input-response'] });
    await expect(
      service.verifyOrThrow({ token: 'bad', expectedAction: 'register' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(claimKeyOnce).not.toHaveBeenCalled();
  });

  it('5) hostname invalid → 400', async () => {
    const service = build();
    mockJson(okBody({ hostname: 'evil.example' }));
    await expect(
      service.verifyOrThrow({ token: 't', expectedAction: 'register' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('6) action mismatch → 400', async () => {
    const service = build();
    mockJson(okBody({ action: 'other' }));
    await expect(
      service.verifyOrThrow({ token: 't', expectedAction: 'register' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('6b) guest-order action must match', async () => {
    const service = build();
    mockJson(okBody({ action: 'guest-order' }));
    await expect(
      service.verifyOrThrow({ token: 't', expectedAction: 'guest-order' }),
    ).resolves.toBeUndefined();
    mockJson(okBody({ action: 'register' }));
    await expect(
      service.verifyOrThrow({ token: 't', expectedAction: 'guest-order' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('7) challenge too old → 400', async () => {
    const service = build();
    const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    mockJson(okBody({ challenge_ts: old }));
    await expect(
      service.verifyOrThrow({ token: 't', expectedAction: 'register' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('8) Cloudflare timeout → 503', async () => {
    const service = build();
    const err = new Error('Aborted');
    err.name = 'TimeoutError';
    fetchMock.mockRejectedValue(err);
    await expect(
      service.verifyOrThrow({ token: 't', expectedAction: 'register' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('9) Cloudflare network error → 503', async () => {
    const service = build();
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(
      service.verifyOrThrow({ token: 't', expectedAction: 'register' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('10) Cloudflare 5xx → 503', async () => {
    const service = build();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({}),
    });
    await expect(
      service.verifyOrThrow({ token: 't', expectedAction: 'register' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('11) secret missing when enabled → 503', async () => {
    const service = build({ secretKey: '', ready: false });
    await expect(
      service.verifyOrThrow({ token: 't' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('12) Redis replay key already exists → 400', async () => {
    const service = build();
    mockJson(okBody());
    claimKeyOnce.mockResolvedValue(false);
    await expect(
      service.verifyOrThrow({ token: 'reuse', expectedAction: 'register' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('13) Redis unavailable when replay on → 503', async () => {
    const service = build();
    mockJson(okBody());
    claimKeyOnce.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(
      service.verifyOrThrow({ token: 't', expectedAction: 'register' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('14) does not log token or secret', async () => {
    const service = build();
    mockJson(okBody());
    await service.verifyOrThrow({ token: 'super-secret-token', expectedAction: 'register' });
    const dumped = [...loggerError.mock.calls, ...loggerWarn.mock.calls]
      .flat()
      .map(String)
      .join('\n');
    expect(dumped).not.toContain('super-secret-token');
    expect(dumped).not.toContain(secret);
  });

  it('15) does not write raw token to Redis key', async () => {
    const service = build();
    mockJson(okBody());
    await service.verifyOrThrow({ token: 'raw-token-value', expectedAction: 'register' });
    const [key] = claimKeyOnce.mock.calls[0];
    expect(key).not.toContain('raw-token-value');
    expect(key).toMatch(/^cardon:captcha:used:[a-f0-9]{64}$/);
  });
});
