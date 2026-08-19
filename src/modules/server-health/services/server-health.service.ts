import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../../../database/prisma.service';
import {
  WORKER_BUILD_VERSION_KEY,
  WORKER_HEARTBEAT_KEY,
  WORKER_HEARTBEAT_TTL_SEC,
} from '../../../queue/worker-heartbeat.service';
import { QueueMonitorService } from '../../queue-monitor/services/queue-monitor.service';
import type {
  ServerComponentCheck,
  ServerComponentStatus,
  ServerHealthPack,
  ServerOverallStatus,
  ServerProcessSnapshot,
  ServerQueueSnapshot,
  ServerWorkerCheck,
} from '../entities/server-health.types';

const LATENCY_DEGRADED_MS = 500;
const HEAP_RATIO_DEGRADED = 0.9;
const EVENT_LOOP_DEGRADED_MS = 100;

@Injectable()
export class ServerHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly queueMonitorService: QueueMonitorService,
  ) {}

  async getPack(): Promise<ServerHealthPack> {
    const [database, redis, workers, processSnap, queues] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkWorkers(),
      this.snapshotProcess(),
      this.safeQueueSnapshot(),
    ]);

    const heartbeatRequired =
      this.configService.get<boolean>('app.workerHeartbeatRequired') ?? false;
    const ready =
      database.status === 'ok' &&
      redis.status === 'ok' &&
      (!heartbeatRequired || workers.status === 'ok');

    const overall = this.resolveOverall({
      ready,
      database,
      redis,
      workers,
      processSnap,
      queues,
    });

    return {
      overall,
      ready,
      checkedAt: new Date().toISOString(),
      buildVersion:
        this.configService.get<string>('app.buildVersion') ??
        process.env.BUILD_VERSION ??
        'unknown',
      gitCommit: process.env.GIT_COMMIT ?? null,
      appRole: process.env.APP_ROLE ?? 'api',
      database,
      redis,
      workers,
      process: processSnap,
      queues,
      links: {
        systemHealth: '/health/ready',
        queues: '/monitoring/queues',
        configurationHealth: '/configuration/health',
      },
    };
  }

  private resolveOverall(input: {
    ready: boolean;
    database: ServerComponentCheck;
    redis: ServerComponentCheck;
    workers: ServerWorkerCheck;
    processSnap: ServerProcessSnapshot;
    queues: ServerQueueSnapshot | null;
  }): ServerOverallStatus {
    if (!input.ready || input.database.status === 'error' || input.redis.status === 'error') {
      return 'DOWN';
    }

    const heapRatio =
      input.processSnap.heapTotalMb > 0
        ? input.processSnap.heapUsedMb / input.processSnap.heapTotalMb
        : 0;
    const latencyHot =
      (input.database.latencyMs ?? 0) >= LATENCY_DEGRADED_MS ||
      (input.redis.latencyMs ?? 0) >= LATENCY_DEGRADED_MS;
    const workersSoft =
      input.workers.status === 'stale' ||
      input.workers.status === 'unknown' ||
      (input.queues != null && !input.queues.workerConnected);
    const queueHot = (input.queues?.failedJobs ?? 0) > 0;
    const processHot =
      heapRatio >= HEAP_RATIO_DEGRADED ||
      input.processSnap.eventLoopLagMs >= EVENT_LOOP_DEGRADED_MS;

    if (latencyHot || workersSoft || queueHot || processHot) {
      return 'DEGRADED';
    }
    return 'OK';
  }

  private async checkDatabase(): Promise<ServerComponentCheck> {
    const started = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', latencyMs: Date.now() - started };
    } catch (error) {
      return {
        status: 'error',
        latencyMs: Date.now() - started,
        detail: error instanceof Error ? error.message : 'database_error',
      };
    }
  }

  private async checkRedis(): Promise<ServerComponentCheck> {
    const redisUrl = this.configService.get<string>('redis.url');
    if (!redisUrl) {
      return { status: 'error', latencyMs: null, detail: 'missing_redis_url' };
    }

    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
    });
    const started = Date.now();
    try {
      await client.connect();
      const pong = await client.ping();
      const latencyMs = Date.now() - started;
      if (pong !== 'PONG') {
        return { status: 'error', latencyMs, detail: 'unexpected_pong' };
      }
      return { status: 'ok', latencyMs };
    } catch (error) {
      return {
        status: 'error',
        latencyMs: Date.now() - started,
        detail: error instanceof Error ? error.message : 'redis_error',
      };
    } finally {
      await client.quit().catch(() => undefined);
    }
  }

  private async checkWorkers(): Promise<ServerWorkerCheck> {
    const required =
      this.configService.get<boolean>('app.workerHeartbeatRequired') ?? false;
    const redisUrl = this.configService.get<string>('redis.url');
    if (!redisUrl) {
      return {
        status: 'unknown',
        ageMs: null,
        lastHeartbeatAt: null,
        buildVersion: null,
        required,
      };
    }

    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
    });

    try {
      await client.connect();
      const [heartbeat, buildVersion] = await Promise.all([
        client.get(WORKER_HEARTBEAT_KEY),
        client.get(WORKER_BUILD_VERSION_KEY),
      ]);
      if (!heartbeat) {
        return {
          status: 'unknown',
          ageMs: null,
          lastHeartbeatAt: null,
          buildVersion,
          required,
        };
      }
      const ts = Number.parseInt(heartbeat, 10);
      const ageMs = Date.now() - ts;
      const status: ServerComponentStatus =
        ageMs <= WORKER_HEARTBEAT_TTL_SEC * 1000 ? 'ok' : 'stale';
      return {
        status,
        ageMs,
        lastHeartbeatAt: new Date(ts).toISOString(),
        buildVersion,
        required,
      };
    } catch {
      return {
        status: 'unknown',
        ageMs: null,
        lastHeartbeatAt: null,
        buildVersion: null,
        required,
      };
    } finally {
      await client.quit().catch(() => undefined);
    }
  }

  private async snapshotProcess(): Promise<ServerProcessSnapshot> {
    const lagStarted = Date.now();
    await new Promise<void>((resolve) => setImmediate(resolve));
    const eventLoopLagMs = Date.now() - lagStarted;
    const mem = process.memoryUsage();
    return {
      uptimeSec: Math.floor(process.uptime()),
      pid: process.pid,
      nodeVersion: process.version,
      heapUsedMb: roundMb(mem.heapUsed),
      heapTotalMb: roundMb(mem.heapTotal),
      rssMb: roundMb(mem.rss),
      externalMb: roundMb(mem.external),
      eventLoopLagMs,
    };
  }

  private async safeQueueSnapshot(): Promise<ServerQueueSnapshot | null> {
    try {
      const { summary } = await this.queueMonitorService.listQueues();
      return {
        waitingJobs: summary.waitingJobs,
        activeJobs: summary.activeJobs,
        delayedJobs: summary.delayedJobs,
        failedJobs: summary.failedJobs,
        redisStatus: summary.redisStatus,
        workerConnected: summary.workerConnected,
      };
    } catch {
      return null;
    }
  }
}

function roundMb(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}
