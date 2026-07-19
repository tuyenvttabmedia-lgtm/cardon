import { Module, forwardRef } from '@nestjs/common';
import { ActivityEventModule } from '../activity-event/activity-event.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';
import { ProviderModule } from '../provider/provider.module';
import { SettingsModule } from '../settings/settings.module';
import { MaintenanceCenterModule } from '../maintenance-center/maintenance-center.module';
import {
  AgentAdminController,
  AgentController,
} from './controllers/agent.controller';
import {
  AgentKycRepository,
  AgentRepository,
  AgentUserRepository,
} from './repositories/agent.repository';
import { LedgerRepository } from './repositories/ledger.repository';
import { AgentAuditService } from './services/agent-audit.service';
import { AgentCredentialService } from './services/agent-credential.service';
import { AgentInviteService } from './services/agent-invite.service';
import { AgentOnboardingService } from './services/agent-onboarding.service';
import { AgentRegistrationService } from './services/agent-registration.service';
import { AgentKycDocumentService } from './services/agent-kyc-document.service';
import { AgentService } from './services/agent.service';
import { LedgerService } from './services/ledger.service';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => NotificationModule),
    forwardRef(() => ProviderModule),
    SettingsModule,
    ActivityEventModule,
    MaintenanceCenterModule,
  ],
  controllers: [AgentController, AgentAdminController],
  providers: [
    AgentRepository,
    AgentKycRepository,
    AgentUserRepository,
    LedgerRepository,
    AgentCredentialService,
    AgentAuditService,
    AgentInviteService,
    AgentOnboardingService,
    AgentRegistrationService,
    AgentKycDocumentService,
    LedgerService,
    AgentService,
  ],
  exports: [
    AgentService,
    LedgerService,
    AgentRepository,
    AgentCredentialService,
    AgentInviteService,
    AgentAuditService,
    AgentRegistrationService,
    AgentOnboardingService,
    AgentKycDocumentService,
  ],
})
export class AgentModule {}
