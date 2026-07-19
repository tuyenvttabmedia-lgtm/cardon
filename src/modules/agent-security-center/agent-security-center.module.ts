import { Module } from '@nestjs/common';
import { ActivityEventModule } from '../activity-event/activity-event.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { ApiObservabilityModule } from '../api-observability/api-observability.module';
import { AgentModule } from '../agent/agent.module';
import { AgentPlatformModule } from '../agent-platform/agent-platform.module';
import { AuthModule } from '../auth/auth.module';
import { AgentSecurityController } from './controllers/agent-security.controller';
import { AgentApiTelemetryService } from './services/agent-api-telemetry.service';
import { AgentSecurityService } from './services/agent-security.service';

@Module({
  imports: [AuthModule, AgentModule, ActivityEventModule, AuditLogModule, AgentPlatformModule, ApiObservabilityModule],
  controllers: [AgentSecurityController],
  providers: [AgentSecurityService, AgentApiTelemetryService],
  exports: [AgentSecurityService, AgentApiTelemetryService],
})
export class AgentSecurityCenterModule {}
