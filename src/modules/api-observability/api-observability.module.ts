import { Module } from '@nestjs/common';
import { ActivityEventModule } from '../activity-event/activity-event.module';
import { AgentModule } from '../agent/agent.module';
import { AgentPlatformModule } from '../agent-platform/agent-platform.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';
import { RbacModule } from '../rbac/rbac.module';
import { AdminPartnerApiLogsController } from './controllers/admin-partner-api-logs.controller';
import { AgentApiOpsController } from './controllers/agent-api-ops.controller';
import { AgentApiRequestLogRepository } from './repositories/agent-api-request-log.repository';
import { AgentApiExportService } from './services/agent-api-export.service';
import { AgentApiRequestLogService } from './services/agent-api-request-log.service';
import { AgentApiTestService } from './services/agent-api-test.service';
import { AgentApiUsageService } from './services/agent-api-usage.service';
import { ApiLogRetentionService } from './services/api-log-retention.service';
import { AgentApiLoggingInterceptor } from './interceptors/agent-api-logging.interceptor';

@Module({
  imports: [AuthModule, RbacModule, AgentModule, AgentPlatformModule, NotificationModule, ActivityEventModule],
  controllers: [AgentApiOpsController, AdminPartnerApiLogsController],
  providers: [
    AgentApiRequestLogRepository,
    AgentApiRequestLogService,
    AgentApiUsageService,
    AgentApiExportService,
    AgentApiTestService,
    ApiLogRetentionService,
    AgentApiLoggingInterceptor,
  ],
  exports: [AgentApiRequestLogService, AgentApiLoggingInterceptor],
})
export class ApiObservabilityModule {}
