import { Module } from '@nestjs/common';
import { QueueModule } from '../../queue/queue.module';
import { HealthModule } from '../health/health.module';
import { NotificationModule } from '../notification/notification.module';
import { ProductModule } from '../product/product.module';
import { ProviderModule } from '../provider/provider.module';
import { SettingsModule } from '../settings/settings.module';
import { MaintenanceCenterModule } from '../maintenance-center/maintenance-center.module';
import { OperationsHealthCollectorService } from './services/operations-health-collector.service';
import { OperationsHealthPdfService } from './services/operations-health-pdf.service';
import { SystemHealthCronService } from './services/system-health-cron.service';
import { SystemHealthService } from './services/system-health.service';
import { SystemVersionService } from './services/system-version.service';

@Module({
  imports: [ProductModule, ProviderModule, NotificationModule, SettingsModule, QueueModule, HealthModule, MaintenanceCenterModule],
  providers: [
    SystemHealthService,
    SystemHealthCronService,
    OperationsHealthCollectorService,
    OperationsHealthPdfService,
    SystemVersionService,
  ],
  exports: [SystemHealthService, SystemVersionService],
})
export class SystemHealthModule {}
