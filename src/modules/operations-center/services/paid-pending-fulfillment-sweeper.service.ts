import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FulfillmentDispatchService } from '../../provider/services/fulfillment-dispatch.service';
import { PaidOrderWatchdogRepository } from '../repositories/paid-order-watchdog.repository';

const DEFAULT_GRACE_MS = 2 * 60 * 1000;
const DEFAULT_BATCH = 20;

export interface PaidPendingSweepResult {
  enabled: boolean;
  scanned: number;
  dispatched: number;
  skipped: number;
  failed: number;
}

/**
 * Re-enqueue fulfillment for PAID + PENDING retail orders after a short grace.
 * Default OFF — enable with PAID_PENDING_FULFILLMENT_SWEEPER_ENABLED=true.
 * Only calls dispatchOrderFulfillment (idempotent; never buyCard directly).
 */
@Injectable()
export class PaidPendingFulfillmentSweeperService {
  private readonly logger = new Logger(PaidPendingFulfillmentSweeperService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly repository: PaidOrderWatchdogRepository,
    private readonly fulfillmentDispatch: FulfillmentDispatchService,
  ) {}

  isEnabled(): boolean {
    return this.config.get<boolean>('fulfillmentSweeper.enabled') === true;
  }

  async sweep(now = new Date()): Promise<PaidPendingSweepResult> {
    if (!this.isEnabled()) {
      return {
        enabled: false,
        scanned: 0,
        dispatched: 0,
        skipped: 0,
        failed: 0,
      };
    }

    const graceMs =
      this.config.get<number>('fulfillmentSweeper.graceMs') ?? DEFAULT_GRACE_MS;
    const take =
      this.config.get<number>('fulfillmentSweeper.batchSize') ?? DEFAULT_BATCH;
    const paidBefore = new Date(now.getTime() - graceMs);

    const orders = await this.repository.findPaidPendingForSweep({
      paidBefore,
      take,
    });

    let dispatched = 0;
    let skipped = 0;
    let failed = 0;

    for (const order of orders) {
      try {
        const jobIds = await this.fulfillmentDispatch.dispatchOrderFulfillment(
          order.id,
          'sweeper',
        );
        if (jobIds.length === 0) {
          skipped += 1;
          this.logger.log(
            `sweeper skip order=${order.orderCode} (no jobs / not PENDING)`,
          );
          continue;
        }
        dispatched += 1;
        this.logger.log(
          `sweeper dispatched order=${order.orderCode} jobs=${jobIds.join(',')}`,
        );
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `sweeper failed order=${order.orderCode}: ${message}`,
        );
      }
    }

    return {
      enabled: true,
      scanned: orders.length,
      dispatched,
      skipped,
      failed,
    };
  }
}
