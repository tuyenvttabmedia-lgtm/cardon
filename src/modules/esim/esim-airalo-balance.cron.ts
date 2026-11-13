import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EsimAiraloBalanceService } from './esim-airalo-balance.service';

const SYNC_INTERVAL_MS = 5 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 45 * 1000;

@Injectable()
export class EsimAiraloBalanceCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EsimAiraloBalanceCronService.name);
  private timer?: ReturnType<typeof setInterval>;
  private firstRun?: ReturnType<typeof setTimeout>;
  private running = false;

  constructor(
    private readonly balance: EsimAiraloBalanceService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.syncArmed()) {
      this.logger.log(
        'Airalo balance cron skipped (need ESIM_PROVIDER_MODE=live + ESIM_LIVE_ARM)',
      );
      return;
    }
    this.firstRun = setTimeout(() => void this.sync(), FIRST_RUN_DELAY_MS);
    this.timer = setInterval(() => void this.sync(), SYNC_INTERVAL_MS);
    this.logger.log(`Airalo balance cron started (every ${SYNC_INTERVAL_MS / 1000}s)`);
  }

  onModuleDestroy(): void {
    if (this.firstRun) clearTimeout(this.firstRun);
    if (this.timer) clearInterval(this.timer);
  }

  async sync(): Promise<void> {
    if (this.running || !this.syncArmed()) return;
    this.running = true;
    try {
      const result = await this.balance.syncBalance();
      this.logger.log(
        `Airalo balance sync ok balance=${result.balance} ${result.currency} low=${result.lowBalance}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Airalo balance sync failed: ${message}`);
    } finally {
      this.running = false;
    }
  }

  private syncArmed(): boolean {
    return (
      this.config.get<string>('esim.providerMode') === 'live' &&
      this.config.get<boolean>('esim.liveArm') === true
    );
  }
}
