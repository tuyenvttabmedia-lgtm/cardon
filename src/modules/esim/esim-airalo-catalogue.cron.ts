import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EsimAiraloCatalogueService } from './esim-airalo-catalogue.service';

const SYNC_INTERVAL_MS = 55 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 90 * 1000;

@Injectable()
export class EsimAiraloCatalogueCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EsimAiraloCatalogueCronService.name);
  private timer?: ReturnType<typeof setInterval>;
  private firstRun?: ReturnType<typeof setTimeout>;
  private running = false;

  constructor(
    private readonly catalogue: EsimAiraloCatalogueService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.armed()) {
      this.logger.log('Airalo package sync cron skipped (ESIM not live-armed)');
      return;
    }
    this.firstRun = setTimeout(() => void this.sync(), FIRST_RUN_DELAY_MS);
    this.timer = setInterval(() => void this.sync(), SYNC_INTERVAL_MS);
    this.logger.log(`Airalo package sync cron started (every ${SYNC_INTERVAL_MS / 60000} min)`);
  }

  onModuleDestroy(): void {
    if (this.firstRun) clearTimeout(this.firstRun);
    if (this.timer) clearInterval(this.timer);
  }

  async sync(): Promise<void> {
    if (this.running || !this.armed()) return;
    this.running = true;
    try {
      const summary = await this.catalogue.importFromAiralo();
      this.logger.log(
        `Airalo package sync ok imported=${summary.imported} published=${summary.published}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Airalo package sync failed: ${message}`);
    } finally {
      this.running = false;
    }
  }

  private armed(): boolean {
    return (
      this.config.get<boolean>('esim.enabled') === true &&
      this.config.get<string>('esim.providerMode') === 'live' &&
      this.config.get<boolean>('esim.liveArm') === true
    );
  }
}
