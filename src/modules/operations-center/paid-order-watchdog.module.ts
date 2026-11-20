import { Module } from '@nestjs/common';
import { NotificationCenterModule } from '../notification-center/notification-center.module';
import { ProviderModule } from '../provider/provider.module';
import { PaidOrderWatchdogRepository } from './repositories/paid-order-watchdog.repository';
import { PaidOrderWatchdogCronService } from './services/paid-order-watchdog-cron.service';
import { PaidOrderWatchdogService } from './services/paid-order-watchdog.service';
import { PaidPendingFulfillmentSweeperCronService } from './services/paid-pending-fulfillment-sweeper-cron.service';
import { PaidPendingFulfillmentSweeperService } from './services/paid-pending-fulfillment-sweeper.service';

@Module({
  imports: [NotificationCenterModule, ProviderModule],
  providers: [
    PaidOrderWatchdogRepository,
    PaidOrderWatchdogService,
    PaidOrderWatchdogCronService,
    PaidPendingFulfillmentSweeperService,
    PaidPendingFulfillmentSweeperCronService,
  ],
})
export class PaidOrderWatchdogModule {}
