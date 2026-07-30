import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { OrderExpirationService } from '../../order/services/order-expiration.service';
import { PaymentExpirationService } from './payment-expiration.service';

const SWEEP_INTERVAL_MS = 60 * 1000;
const FIRST_RUN_DELAY_MS = 15 * 1000;

@Injectable()
export class ExpirationCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExpirationCronService.name);
  private timer?: ReturnType<typeof setInterval>;
  private firstRunTimer?: ReturnType<typeof setTimeout>;
  private running = false;

  constructor(
    private readonly paymentExpirationService: PaymentExpirationService,
    private readonly orderExpirationService: OrderExpirationService,
  ) {}

  onModuleInit(): void {
    this.firstRunTimer = setTimeout(() => void this.sweep(), FIRST_RUN_DELAY_MS);
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.logger.log(
      `Expiration sweep started (every ${SWEEP_INTERVAL_MS / 1000}s)`,
    );
  }

  onModuleDestroy(): void {
    if (this.firstRunTimer) {
      clearTimeout(this.firstRunTimer);
    }
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async sweep(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const payments = await this.paymentExpirationService.expireDuePayments();
      const orders = await this.orderExpirationService.expireDueOrders();
      if (payments > 0 || orders > 0) {
        this.logger.log(
          `Expired ${payments} payment(s) and ${orders} order(s) past payment window`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Expiration sweep failed: ${message}`);
    } finally {
      this.running = false;
    }
  }
}
