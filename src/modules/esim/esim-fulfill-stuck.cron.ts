import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { shouldRegisterWorkers } from '../../config/process-role';
import { EsimFulfillmentRepository } from './esim-fulfillment.repository';
import { EsimQueueProducer } from './esim-queue.producer';

const SCAN_INTERVAL_MS = 3 * 60 * 1000;
const FIRST_SCAN_DELAY_MS = 60_000;
const STUCK_OLDER_THAN_MS = 5 * 60_000;

/**
 * Re-enqueues FULFILL for PAID+PENDING eSIM orders that never claimed CREATE
 * (e.g. Redis blip after SePay settle). openGuard + claimFirstCreate still dedupe.
 */
@Injectable()
export class EsimFulfillStuckCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EsimFulfillStuckCronService.name);
  private firstScanTimer?: ReturnType<typeof setTimeout>;
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly repository: EsimFulfillmentRepository,
    private readonly producer: EsimQueueProducer,
  ) {}

  onModuleInit(): void {
    if (!shouldRegisterWorkers()) {
      return;
    }
    this.firstScanTimer = setTimeout(() => void this.scan(), FIRST_SCAN_DELAY_MS);
    this.timer = setInterval(() => void this.scan(), SCAN_INTERVAL_MS);
    this.logger.log(`eSIM fulfill-stuck scan started (every ${SCAN_INTERVAL_MS / 60_000}m)`);
  }

  onModuleDestroy(): void {
    if (this.firstScanTimer) clearTimeout(this.firstScanTimer);
    if (this.timer) clearInterval(this.timer);
  }

  async scan(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const orderIds = await this.repository.listPaidPendingStuckOrderIds(STUCK_OLDER_THAN_MS);
      for (const orderId of orderIds) {
        await this.producer.enqueueFulfillment(orderId);
      }
      if (orderIds.length > 0) {
        this.logger.log(`fulfill-stuck scan enqueued=${orderIds.length}`);
      }
    } catch (error) {
      this.logger.warn(
        `fulfill-stuck scan failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    } finally {
      this.running = false;
    }
  }
}
