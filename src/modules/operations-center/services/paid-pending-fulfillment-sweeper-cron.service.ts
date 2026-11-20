import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { shouldRegisterWorkers } from '../../../config/process-role';
import { PaidPendingFulfillmentSweeperService } from './paid-pending-fulfillment-sweeper.service';

const DEFAULT_INTERVAL_MS = 60 * 1000;
const FIRST_DELAY_MS = 45 * 1000;

@Injectable()
export class PaidPendingFulfillmentSweeperCronService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    PaidPendingFulfillmentSweeperCronService.name,
  );
  private firstTimer?: ReturnType<typeof setTimeout>;
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly sweeper: PaidPendingFulfillmentSweeperService,
  ) {}

  onModuleInit(): void {
    if (!shouldRegisterWorkers()) {
      return;
    }
    if (!this.sweeper.isEnabled()) {
      this.logger.log(
        'Paid-pending fulfillment sweeper disabled (PAID_PENDING_FULFILLMENT_SWEEPER_ENABLED≠true)',
      );
      return;
    }

    const intervalMs =
      this.config.get<number>('fulfillmentSweeper.intervalMs') ??
      DEFAULT_INTERVAL_MS;

    this.firstTimer = setTimeout(() => void this.run(), FIRST_DELAY_MS);
    this.timer = setInterval(() => void this.run(), intervalMs);
    this.logger.log(
      `Paid-pending fulfillment sweeper started (every ${Math.round(intervalMs / 1000)}s)`,
    );
  }

  onModuleDestroy(): void {
    if (this.firstTimer) clearTimeout(this.firstTimer);
    if (this.timer) clearInterval(this.timer);
  }

  async run(): Promise<void> {
    if (this.running || !this.sweeper.isEnabled()) {
      return;
    }
    this.running = true;
    try {
      const result = await this.sweeper.sweep();
      if (result.scanned > 0) {
        this.logger.log(
          `sweeper scanned=${result.scanned} dispatched=${result.dispatched} skipped=${result.skipped} failed=${result.failed}`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Paid-pending fulfillment sweeper failed: ${message}`);
    } finally {
      this.running = false;
    }
  }
}
