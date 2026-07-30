import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { shouldRegisterWorkers } from '../../../config/process-role';
import { OrderRevenueReconcileService } from './order-revenue-reconcile.service';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class OrderRevenueReconcileCronService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(OrderRevenueReconcileCronService.name);
  private timer?: ReturnType<typeof setTimeout>;
  private interval?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(private readonly reconcileService: OrderRevenueReconcileService) {}

  onModuleInit(): void {
    if (!shouldRegisterWorkers()) {
      return;
    }
    this.scheduleDaily();
  }

  onModuleDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.interval) clearInterval(this.interval);
  }

  private scheduleDaily() {
    const now = new Date();
    const next = this.nextVietnamRun(now);
    const delay = next.getTime() - now.getTime();
    this.logger.log(
      `Order-revenue reconcile cron scheduled at ${next.toISOString()} (in ${Math.round(delay / 60000)} min)`,
    );

    this.timer = setTimeout(() => {
      void this.runDaily();
      this.interval = setInterval(() => void this.runDaily(), MS_PER_DAY);
    }, delay);
  }

  /** 02:05 Asia/Ho_Chi_Minh = 19:05 UTC previous calendar day for most of the year. */
  private nextVietnamRun(now: Date): Date {
    const vnNow = new Date(
      now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }),
    );
    const targetVn = new Date(vnNow);
    targetVn.setHours(2, 5, 0, 0);
    if (targetVn <= vnNow) {
      targetVn.setDate(targetVn.getDate() + 1);
    }
    const lagMs = targetVn.getTime() - vnNow.getTime();
    return new Date(now.getTime() + lagMs);
  }

  private async runDaily() {
    if (this.running) return;
    this.running = true;
    try {
      await this.reconcileService.runForPreviousDay();
    } catch (error) {
      this.logger.warn(
        `Order-revenue reconcile failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.running = false;
    }
  }
}
