import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ProviderHealthService } from './provider-health.service';
import { ProviderBalanceRepository } from '../repositories/provider-balance.repository';
import { ProviderRepository } from '../repositories/provider.repository';

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class ProviderBalanceCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProviderBalanceCronService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly providerRepository: ProviderRepository,
    private readonly balanceRepository: ProviderBalanceRepository,
    private readonly healthService: ProviderHealthService,
  ) {}

  onModuleInit(): void {
    void this.syncAll();
    this.timer = setInterval(() => void this.syncAll(), SYNC_INTERVAL_MS);
    this.logger.log(`Provider balance cron started (every ${SYNC_INTERVAL_MS / 1000}s)`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async syncAll(): Promise<void> {
    const providers = await this.providerRepository.listActiveProviders();
    for (const provider of providers) {
      try {
        await this.balanceRepository.ensureForProvider(provider.id);
        await this.healthService.syncProviderBalance(provider.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Balance sync failed provider=${provider.code}: ${message}`);
      }
    }
  }
}
