import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { shouldRegisterWorkers } from '../../config/process-role';
import { EsimFulfillmentRepository } from './esim-fulfillment.repository';
import { EsimQueueProducer } from './esim-queue.producer';

const SCAN_INTERVAL_MS = 5 * 60 * 1000;
const FIRST_SCAN_DELAY_MS = 45 * 1000;

/**
 * Enqueues QUERY_OPEN jobs for PROCESSING eSIM orders that already have
 * a stored provider reference and an open CREATE guard. Never CREATE.
 */
@Injectable()
export class EsimQueryOpenCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EsimQueryOpenCronService.name);
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
    this.logger.log(`eSIM query-open scan started (every ${SCAN_INTERVAL_MS / 60_000}m)`);
  }

  onModuleDestroy(): void {
    if (this.firstScanTimer) {
      clearTimeout(this.firstScanTimer);
    }
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async scan(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const orderIds = await this.repository.listQueryOpenRecoveryOrderIds();
      for (const orderId of orderIds) {
        await this.producer.enqueueQueryOpen(orderId);
      }
      if (orderIds.length > 0) {
        this.logger.log(`query-open scan enqueued=${orderIds.length}`);
      }
    } catch (error) {
      this.logger.warn(
        `query-open scan failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    } finally {
      this.running = false;
    }
  }
}
