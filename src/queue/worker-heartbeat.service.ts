import { InjectQueue } from '@nestjs/bullmq';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { shouldRegisterWorkers } from '../config/process-role';

export const WORKER_HEARTBEAT_KEY = 'cardon:worker:heartbeat';
export const WORKER_BUILD_VERSION_KEY = 'cardon:worker:buildVersion';
export const WORKER_HEARTBEAT_TTL_SEC = 90;
export const WORKER_HEARTBEAT_INTERVAL_MS = 30_000;

@Injectable()
export class WorkerHeartbeatService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerHeartbeatService.name);
  private interval?: NodeJS.Timeout;

  constructor(@InjectQueue('provider_queue') private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    if (!shouldRegisterWorkers()) {
      return;
    }

    await this.beat();
    this.interval = setInterval(() => {
      void this.beat();
    }, WORKER_HEARTBEAT_INTERVAL_MS);
    this.logger.log('Worker heartbeat started');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  private async beat(): Promise<void> {
    const client = await this.queue.client;
    const buildVersion = process.env.BUILD_VERSION ?? 'unknown';
    await client.set(WORKER_HEARTBEAT_KEY, Date.now().toString(), {
      EX: WORKER_HEARTBEAT_TTL_SEC,
    });
    await client.set(WORKER_BUILD_VERSION_KEY, buildVersion, {
      EX: WORKER_HEARTBEAT_TTL_SEC,
    });
  }
}
