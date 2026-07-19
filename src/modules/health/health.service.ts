import { Injectable } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import Redis from 'ioredis';

import { PrismaService } from '../../database/prisma.service';

import {

  WORKER_HEARTBEAT_KEY,

  WORKER_HEARTBEAT_TTL_SEC,

} from '../../queue/worker-heartbeat.service';



export interface HealthCheckResult {

  app: string;

  database: string;

  redis: string;

  workers: string;

}



export interface HealthReadyResult extends HealthCheckResult {

  ready: boolean;

}



@Injectable()

export class HealthService {

  constructor(

    private readonly prisma: PrismaService,

    private readonly configService: ConfigService,

  ) {}



  async check(): Promise<HealthCheckResult> {

    const [database, redis, workers] = await Promise.all([

      this.checkDatabase(),

      this.checkRedis(),

      this.checkWorkers(),

    ]);



    return {

      app: 'ok',

      database,

      redis,

      workers,

    };

  }



  async checkReady(): Promise<HealthReadyResult> {

    const result = await this.check();

    const heartbeatRequired =

      this.configService.get<boolean>('app.workerHeartbeatRequired') ?? false;



    const ready =

      result.database === 'ok' &&

      result.redis === 'ok' &&

      (!heartbeatRequired || result.workers === 'ok');



    return { ...result, ready };

  }



  private async checkDatabase(): Promise<string> {

    try {

      await this.prisma.$queryRaw`SELECT 1`;

      return 'ok';

    } catch {

      return 'error';

    }

  }



  private async checkRedis(): Promise<string> {

    const redisUrl = this.configService.get<string>('redis.url');

    if (!redisUrl) {

      return 'error';

    }



    const client = new Redis(redisUrl, {

      maxRetriesPerRequest: 1,

      connectTimeout: 3000,

      lazyConnect: true,

    });



    try {

      await client.connect();

      const pong = await client.ping();

      return pong === 'PONG' ? 'ok' : 'error';

    } catch {

      return 'error';

    } finally {

      await client.quit().catch(() => undefined);

    }

  }



  private async checkWorkers(): Promise<string> {

    const redisUrl = this.configService.get<string>('redis.url');

    if (!redisUrl) {

      return 'unknown';

    }



    const client = new Redis(redisUrl, {

      maxRetriesPerRequest: 1,

      connectTimeout: 3000,

      lazyConnect: true,

    });



    try {

      await client.connect();

      const heartbeat = await client.get(WORKER_HEARTBEAT_KEY);

      if (!heartbeat) {

        return 'unknown';

      }



      const ageMs = Date.now() - Number.parseInt(heartbeat, 10);

      const maxAgeMs = WORKER_HEARTBEAT_TTL_SEC * 1000;

      return ageMs <= maxAgeMs ? 'ok' : 'stale';

    } catch {

      return 'unknown';

    } finally {

      await client.quit().catch(() => undefined);

    }

  }

}


