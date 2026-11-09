import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import Redis from 'ioredis';
import {
  ABUSE_INCR_EXPIRE_LUA,
  ABUSE_KEY_PREFIX,
  resolveAbuseBucketConfig,
  type AbuseBucket,
  type AbuseDimension,
} from './abuse-rate-limit.constants';
import type { AbuseConsumeInput, AbuseDimensionValue } from './abuse-rate-limit.types';

@Injectable()
export class AbuseRateLimitService implements OnModuleDestroy {
  private readonly logger = new Logger(AbuseRateLimitService.name);
  private client: Redis | null = null;
  private redisErrorCount = 0;
  private lastLatencyMs = 0;

  constructor(private readonly configService: ConfigService) {}

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
      this.client = null;
    }
  }

  isEnabled(): boolean {
    const enabled = this.configService.get<boolean>('abuseRateLimit.enabled');
    return enabled !== false;
  }

  getMetrics(): { redisErrorCount: number; lastLatencyMs: number } {
    return {
      redisErrorCount: this.redisErrorCount,
      lastLatencyMs: this.lastLatencyMs,
    };
  }

  /**
   * Fail-closed consume for auth/ticket/KYC buckets.
   * Throws 429 when over limit; 503 when Redis unavailable.
   */
  async consumeOrThrow(input: AbuseConsumeInput): Promise<void> {
    await this.consumeInternal(input, 'closed');
  }

  /**
   * W5 checkout: throw 429 when over limit; on Redis errors log + allow (fail-open).
   */
  async consumeFailOpen(input: AbuseConsumeInput): Promise<void> {
    await this.consumeInternal(input, 'open');
  }

  private async consumeInternal(
    input: AbuseConsumeInput,
    redisPolicy: 'closed' | 'open',
  ): Promise<void> {
    if (!this.isEnabled()) return;

    const config = resolveAbuseBucketConfig(input.bucket);
    const dims = this.resolveDimensions(input.bucket, config.dimensions, input);
    if (dims.length === 0) {
      this.logger.warn(
        `abuse_skip_no_dimensions bucket=${input.bucket}`,
      );
      return;
    }

    try {
      const counts = await Promise.all(
        dims.map((d) => this.incr(input.bucket, d.dimension, d.value, config.ttlSeconds)),
      );
      const over = counts.some((n) => n > config.limit);
      if (over) {
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Too many requests. Please try again later.',
            error: 'Too Many Requests',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.redisErrorCount += 1;
      this.logger.error(
        `abuse_redis_error bucket=${input.bucket} policy=${redisPolicy} detail=${
          error instanceof Error ? error.message : String(error)
        } errors=${this.redisErrorCount}`,
      );
      if (redisPolicy === 'open') {
        return;
      }
      throw new ServiceUnavailableException(
        'Security rate limiter temporarily unavailable',
      );
    }
  }

  /** Test/helper: increment a single key; returns new count. */
  async incr(
    bucket: AbuseBucket,
    dimension: AbuseDimension,
    id: string,
    ttlSeconds: number,
  ): Promise<number> {
    const key = `${ABUSE_KEY_PREFIX}${bucket}:${dimension}:${id}`;
    const redis = await this.getClient();
    const started = Date.now();
    const result = await redis.eval(ABUSE_INCR_EXPIRE_LUA, 1, key, String(ttlSeconds));
    this.lastLatencyMs = Date.now() - started;
    const n = typeof result === 'number' ? result : Number(result);
    if (!Number.isFinite(n)) {
      throw new Error('abuse_incr_invalid_result');
    }
    return n;
  }

  /**
   * Atomic SET NX EX for captcha replay (and similar one-shot claims).
   * Reuses the abuse Redis connection — does not touch `cardon:abuse:*` keys.
   * @returns true if the key was set (first claim), false if already present.
   */
  async claimKeyOnce(fullKey: string, ttlSeconds: number): Promise<boolean> {
    const redis = await this.getClient();
    const started = Date.now();
    const result = await redis.set(fullKey, '1', 'EX', ttlSeconds, 'NX');
    this.lastLatencyMs = Date.now() - started;
    return result === 'OK';
  }

  private resolveDimensions(
    bucket: AbuseBucket,
    dimensions: AbuseDimension[],
    input: AbuseConsumeInput,
  ): AbuseDimensionValue[] {
    const out: AbuseDimensionValue[] = [];
    for (const dimension of dimensions) {
      if (dimension === 'ip') {
        const ip = input.ip?.trim();
        if (ip) out.push({ dimension, value: ip.slice(0, 128) });
      } else if (dimension === 'userId') {
        const userId = input.userId?.trim();
        if (userId) out.push({ dimension, value: userId });
      } else if (dimension === 'emailHash') {
        const email = input.email?.trim().toLowerCase();
        if (email) {
          out.push({
            dimension,
            value: createHash('sha256').update(email).digest('hex').slice(0, 32),
          });
        }
      }
    }
    void bucket;
    return out;
  }

  private async getClient(): Promise<Redis> {
    if (this.client) return this.client;

    const url =
      this.configService.get<string>('abuseRateLimit.redisUrl') ??
      this.configService.get<string>('redis.url');
    if (!url) {
      throw new Error('abuse_redis_url_missing');
    }

    const commandTimeoutMs =
      this.configService.get<number>('abuseRateLimit.commandTimeoutMs') ?? 100;

    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      connectTimeout: Math.max(commandTimeoutMs, 1000),
      commandTimeout: commandTimeoutMs,
      lazyConnect: true,
      retryStrategy: (times) => (times > 2 ? null : Math.min(times * 100, 500)),
    });

    client.on('error', (err) => {
      this.logger.warn(`abuse_redis_client_error ${err.message}`);
    });

    try {
      await client.connect();
      this.client = client;
      return client;
    } catch (error) {
      await client.quit().catch(() => undefined);
      throw error;
    }
  }

  /** @internal test helper */
  setClientForTests(client: Redis | null): void {
    this.client = client;
  }
}
