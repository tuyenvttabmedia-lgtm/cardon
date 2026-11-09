import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { AbuseRateLimitService } from '../abuse-rate-limit/abuse-rate-limit.service';
import { SettingsStoreService } from '../../modules/settings/services/settings-store.service';
import {
  CAPTCHA_USED_KEY_PREFIX,
  TURNSTILE_DEFAULT_MAX_AGE_SEC,
  TURNSTILE_DEFAULT_TIMEOUT_MS,
  TURNSTILE_MSG_FAILED,
  TURNSTILE_MSG_MISCONFIGURED,
  TURNSTILE_MSG_UNAVAILABLE,
  TURNSTILE_SITEVERIFY_URL,
} from './turnstile.constants';

export type TurnstileVerifyInput = {
  token?: string | null;
  remoteIp?: string | null;
  expectedAction?: string;
};

type SiteverifyResponse = {
  success?: boolean;
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  'error-codes'?: string[];
};

@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly abuseRateLimit: AbuseRateLimitService,
    private readonly settingsStore: SettingsStoreService,
  ) {}

  isEnabled(): boolean {
    return this.settingsStore.resolveTurnstile().enabled === true;
  }

  /**
   * Server-side Turnstile verification. No-op when disabled (admin/ENV).
   * Order for callers: verifyOrThrow → abuse consume → business.
   */
  async verifyOrThrow(input: TurnstileVerifyInput): Promise<void> {
    const resolved = this.settingsStore.resolveTurnstile();
    if (!resolved.enabled) return;

    const secret = resolved.secretKey.trim();
    if (!secret) {
      this.logger.error('turnstile_misconfigured reason=missing_secret');
      throw new ServiceUnavailableException(TURNSTILE_MSG_MISCONFIGURED);
    }

    const token = input.token?.trim() ?? '';
    if (!token) {
      this.logger.warn('turnstile_reject reason=missing_token');
      throw new BadRequestException(TURNSTILE_MSG_FAILED);
    }

    const body = await this.siteverify(secret, token, input.remoteIp);
    this.assertSiteverifyOk(body, input.expectedAction, resolved.allowedHostnames);

    await this.claimReplayOrThrow(token);
  }

  private async siteverify(
    secret: string,
    token: string,
    remoteIp?: string | null,
  ): Promise<SiteverifyResponse> {
    const timeoutMs =
      this.configService.get<number>('turnstile.timeoutMs') ??
      TURNSTILE_DEFAULT_TIMEOUT_MS;

    const form = new URLSearchParams();
    form.set('secret', secret);
    form.set('response', token);
    const ip = remoteIp?.trim();
    if (ip) form.set('remoteip', ip);

    let response: Response;
    try {
      response = await fetch(TURNSTILE_SITEVERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : 'Error';
      const reason =
        name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network';
      this.logger.error(`turnstile_siteverify_error reason=${reason}`);
      throw new ServiceUnavailableException(TURNSTILE_MSG_UNAVAILABLE);
    }

    if (response.status >= 500) {
      this.logger.error(`turnstile_siteverify_error reason=http_${response.status}`);
      throw new ServiceUnavailableException(TURNSTILE_MSG_UNAVAILABLE);
    }

    if (!response.ok) {
      this.logger.warn(`turnstile_siteverify_error reason=http_${response.status}`);
      throw new BadRequestException(TURNSTILE_MSG_FAILED);
    }

    try {
      return (await response.json()) as SiteverifyResponse;
    } catch {
      this.logger.error('turnstile_siteverify_error reason=invalid_json');
      throw new ServiceUnavailableException(TURNSTILE_MSG_UNAVAILABLE);
    }
  }

  private assertSiteverifyOk(
    body: SiteverifyResponse,
    expectedAction: string | undefined,
    allowedHostnamesCsv: string,
  ): void {
    if (body.success !== true) {
      this.logger.warn('turnstile_reject reason=success_false');
      throw new BadRequestException(TURNSTILE_MSG_FAILED);
    }

    const allowed = allowedHostnamesCsv
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);
    const hostname = (body.hostname ?? '').trim().toLowerCase();
    if (allowed.length > 0) {
      if (!hostname || !allowed.includes(hostname)) {
        this.logger.warn('turnstile_reject reason=hostname');
        throw new BadRequestException(TURNSTILE_MSG_FAILED);
      }
    }

    if (expectedAction) {
      const action = (body.action ?? '').trim();
      if (action !== expectedAction) {
        this.logger.warn('turnstile_reject reason=action_mismatch');
        throw new BadRequestException(TURNSTILE_MSG_FAILED);
      }
    }

    const maxAge =
      this.configService.get<number>('turnstile.maxAgeSec') ??
      TURNSTILE_DEFAULT_MAX_AGE_SEC;
    const ts = body.challenge_ts;
    if (ts) {
      const challenged = Date.parse(ts);
      if (!Number.isFinite(challenged)) {
        this.logger.warn('turnstile_reject reason=challenge_ts_invalid');
        throw new BadRequestException(TURNSTILE_MSG_FAILED);
      }
      const ageSec = (Date.now() - challenged) / 1000;
      if (ageSec > maxAge || ageSec < -60) {
        this.logger.warn('turnstile_reject reason=challenge_ts_stale');
        throw new BadRequestException(TURNSTILE_MSG_FAILED);
      }
    }
  }

  private async claimReplayOrThrow(token: string): Promise<void> {
    const replayEnabled =
      this.configService.get<boolean>('turnstile.replayEnabled') !== false;
    if (!replayEnabled) return;

    const hash = createHash('sha256').update(token).digest('hex');
    const key = `${CAPTCHA_USED_KEY_PREFIX}${hash}`;
    const ttl =
      this.configService.get<number>('turnstile.maxAgeSec') ??
      TURNSTILE_DEFAULT_MAX_AGE_SEC;

    try {
      const claimed = await this.abuseRateLimit.claimKeyOnce(key, ttl);
      if (!claimed) {
        this.logger.warn('turnstile_reject reason=replay');
        throw new BadRequestException(TURNSTILE_MSG_FAILED);
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(
        `turnstile_replay_redis_error detail=${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      throw new ServiceUnavailableException(TURNSTILE_MSG_UNAVAILABLE);
    }
  }
}
