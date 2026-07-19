import { Module, forwardRef } from '@nestjs/common';
import { ActivityEventModule } from '../activity-event/activity-event.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { NotificationModule } from '../notification/notification.module';
import { SettingsModule } from '../settings/settings.module';
import { MaintenanceCenterController } from './controllers/maintenance-center.controller';
import { PlatformMaintenanceGuard } from './guards/platform-maintenance.guard';
import { MaintenanceAvailabilityService } from './services/maintenance-availability.service';
import { MaintenanceCenterService } from './services/maintenance-center.service';

@Module({
  imports: [
    SettingsModule,
    ActivityEventModule,
    forwardRef(() => AuditLogModule),
    forwardRef(() => NotificationModule),
  ],
  controllers: [MaintenanceCenterController],
  providers: [
    MaintenanceCenterService,
    MaintenanceAvailabilityService,
    PlatformMaintenanceGuard,
  ],
  exports: [MaintenanceAvailabilityService, PlatformMaintenanceGuard, MaintenanceCenterService],
})
export class MaintenanceCenterModule {}
