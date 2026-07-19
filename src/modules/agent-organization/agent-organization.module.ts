import { Module, forwardRef } from '@nestjs/common';
import { ActivityEventModule } from '../activity-event/activity-event.module';
import { AgentModule } from '../agent/agent.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';
import { AdminAgentOrganizationController } from './controllers/admin-agent-organization.controller';
import {
  AgentInvitePublicController,
  AgentOrganizationController,
} from './controllers/agent-organization.controller';
import { AgentImpersonationService } from './services/agent-impersonation.service';
import { AgentLoginHistoryService } from './services/agent-login-history.service';
import { AgentMemberContextService } from './services/agent-member-context.service';
import { AgentOrganizationService } from './services/agent-organization.service';

@Module({
  imports: [AgentModule, NotificationModule, ActivityEventModule, forwardRef(() => AuthModule)],
  controllers: [AgentOrganizationController, AgentInvitePublicController, AdminAgentOrganizationController],
  providers: [
    AgentMemberContextService,
    AgentOrganizationService,
    AgentImpersonationService,
    AgentLoginHistoryService,
  ],
  exports: [AgentMemberContextService, AgentOrganizationService, AgentLoginHistoryService],
})
export class AgentOrganizationModule {}
