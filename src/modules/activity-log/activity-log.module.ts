import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ActivityEventModule } from '../activity-event/activity-event.module';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { ActivityLogController } from './controllers/activity-log.controller';
import { ActivityExportInterceptor } from './interceptors/activity-export.interceptor';
import { ActivityLogRepository } from './repositories/activity-log.repository';
import { ActivityLogService } from './services/activity-log.service';
import { ActivityLogSubscriber } from './subscribers/activity-log.subscriber';

@Module({
  imports: [ActivityEventModule, AuthModule, RbacModule],
  controllers: [ActivityLogController],
  providers: [
    ActivityLogRepository,
    ActivityLogService,
    ActivityLogSubscriber,
    {
      provide: APP_INTERCEPTOR,
      useClass: ActivityExportInterceptor,
    },
  ],
  exports: [ActivityLogService, ActivityEventModule],
})
export class ActivityLogModule {}
