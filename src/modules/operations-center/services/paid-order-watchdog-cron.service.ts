import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { shouldRegisterWorkers } from '../../../config/process-role';
import { PaidOrderWatchdogService } from './paid-order-watchdog.service';

const SCAN_INTERVAL_MS = 5 * 60 * 1000;
const FIRST_SCAN_DELAY_MS = 30 * 1000;

@Injectable()
export class PaidOrderWatchdogCronService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PaidOrderWatchdogCronService.name);
  private firstScanTimer?: ReturnType<typeof setTimeout>;
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(private readonly watchdog: PaidOrderWatchdogService) {}

  onModuleInit(): void {
    if (!shouldRegisterWorkers()) {
      return;
    }

    this.firstScanTimer = setTimeout(
      () => void this.run(),
      FIRST_SCAN_DELAY_MS,
    );
    this.timer = setInterval(() => void this.run(), SCAN_INTERVAL_MS);
    this.logger.log(
      `Paid-order watchdog started (every ${SCAN_INTERVAL_MS / 60_000}m)`,
    );
  }

  onModuleDestroy(): void {
    if (this.firstScanTimer) {
      clearTimeout(this.firstScanTimer);
    }
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async run(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      await this.watchdog.scan();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Paid-order watchdog scan failed: ${message}`);
    } finally {
      this.running = false;
    }
  }
}
