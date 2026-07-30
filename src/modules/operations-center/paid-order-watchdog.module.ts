import { Module } from '@nestjs/common';
import { NotificationCenterModule } from '../notification-center/notification-center.module';
import { PaidOrderWatchdogRepository } from './repositories/paid-order-watchdog.repository';
import { PaidOrderWatchdogCronService } from './services/paid-order-watchdog-cron.service';
import { PaidOrderWatchdogService } from './services/paid-order-watchdog.service';

@Module({
  imports: [NotificationCenterModule],
  providers: [
    PaidOrderWatchdogRepository,
    PaidOrderWatchdogService,
    PaidOrderWatchdogCronService,
  ],
})
export class PaidOrderWatchdogModule {}
