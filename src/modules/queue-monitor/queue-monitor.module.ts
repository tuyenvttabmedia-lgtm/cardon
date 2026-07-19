import { Module } from '@nestjs/common';

import { ActivityEventModule } from '../activity-event/activity-event.module';

import { AuditLogModule } from '../audit-log/audit-log.module';

import { AuthModule } from '../auth/auth.module';

import { RbacModule } from '../rbac/rbac.module';

import { QueueMonitorController } from './controllers/queue-monitor.controller';

import { QueueMonitorExportService } from './services/queue-monitor-export.service';

import { QueueMonitorService } from './services/queue-monitor.service';



@Module({

  imports: [AuthModule, RbacModule, ActivityEventModule, AuditLogModule],

  controllers: [QueueMonitorController],

  providers: [QueueMonitorService, QueueMonitorExportService],

  exports: [QueueMonitorService],

})

export class QueueMonitorModule {}

