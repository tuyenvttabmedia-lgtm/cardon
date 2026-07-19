import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../database/prisma.service';
import {
  WORKER_BUILD_VERSION_KEY,
} from '../../../queue/worker-heartbeat.service';
import {
  normalizeBuildVersion,
  versionsMatch,
} from '../../settings/entities/payment-gateway-priority';

export type ServiceVersionStatus = 'ok' | 'mismatch' | 'unknown';

export interface ServiceVersionEntry {
  version: string;
  status: ServiceVersionStatus;
}

export interface SystemVersionInfo {
  build: string;
  database: {
    migrationCount: number;
  };
  services: {
    api: ServiceVersionEntry;
    web: ServiceVersionEntry;
    admin: ServiceVersionEntry;
    worker: ServiceVersionEntry;
  };
  versionMismatch: boolean;
  gitCommit: string | null;
  deployTime: string | null;
}

const BUILD_COMMENT_RE = /<!-- CardOn(?:\s+\w+)?\s+build\s+([^>]+)\s*-->/i;

@Injectable()
export class SystemVersionService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    @InjectQueue('provider_queue') private readonly queue: Queue,
  ) {}

  async collect(): Promise<SystemVersionInfo> {
    const build =
      this.configService.get<string>('app.buildVersion') ??
      process.env.BUILD_VERSION ??
      'unknown';

    const [migrationCount, webVersion, adminVersion, workerVersion] = await Promise.all([
      this.countMigrations(),
      this.fetchFrontendBuildVersion(
        this.configService.get<string>('app.webInternalUrl') ?? process.env.WEB_INTERNAL_URL,
      ),
      this.fetchFrontendBuildVersion(
        this.configService.get<string>('app.adminInternalUrl') ?? process.env.ADMIN_INTERNAL_URL,
      ),
      this.fetchWorkerBuildVersion(),
    ]);

    const services = {
      api: this.toServiceEntry(build, build),
      web: this.toServiceEntry(build, webVersion),
      admin: this.toServiceEntry(build, adminVersion),
      worker: this.toServiceEntry(build, workerVersion),
    };

    const versionMismatch = Object.values(services).some(
      (service) => service.status === 'mismatch' || service.status === 'unknown',
    );

    return {
      build,
      database: { migrationCount },
      services,
      versionMismatch,
      gitCommit: process.env.GIT_COMMIT ?? null,
      deployTime: process.env.DEPLOY_TIME ?? null,
    };
  }

  private toServiceEntry(expected: string, actual: string | null): ServiceVersionEntry {
    if (!actual) {
      return { version: 'unknown', status: 'unknown' };
    }
    return {
      version: normalizeBuildVersion(actual),
      status: versionsMatch(expected, actual) ? 'ok' : 'mismatch',
    };
  }

  private async countMigrations(): Promise<number> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS count FROM _prisma_migrations
      `;
      return Number(rows[0]?.count ?? 0);
    } catch {
      return 0;
    }
  }

  private async fetchFrontendBuildVersion(baseUrl?: string | null): Promise<string | null> {
    if (!baseUrl) return null;
    try {
      const response = await fetch(baseUrl.replace(/\/$/, ''), {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return null;
      const html = await response.text();
      const match = html.match(BUILD_COMMENT_RE);
      return match?.[1]?.trim() ?? null;
    } catch {
      return null;
    }
  }

  private async fetchWorkerBuildVersion(): Promise<string | null> {
    try {
      const client = await this.queue.client;
      return (await client.get(WORKER_BUILD_VERSION_KEY)) ?? null;
    } catch {
      return null;
    }
  }
}
