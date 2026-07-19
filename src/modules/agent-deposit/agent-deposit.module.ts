import { Module, forwardRef } from '@nestjs/common';
import { ActivityEventModule } from '../activity-event/activity-event.module';
import { AgentModule } from '../agent/agent.module';
import { NotificationModule } from '../notification/notification.module';
import { PaymentModule } from '../payment/payment.module';
import { SettingsModule } from '../settings/settings.module';
import { AgentDepositRepository } from './repositories/agent-deposit.repository';
import { AgentDepositService } from './services/agent-deposit.service';
import { AgentDepositWebhookService } from './services/agent-deposit-webhook.service';

/**
 * Registered in AppModule only (after PaymentModule) to avoid PaymentModule ↔ AgentDeposit circular import.
 */
@Module({
  imports: [
    AgentModule,
    NotificationModule,
    ActivityEventModule,
    SettingsModule,
    forwardRef(() => PaymentModule),
  ],
  providers: [AgentDepositRepository, AgentDepositService, AgentDepositWebhookService],
  exports: [AgentDepositService, AgentDepositWebhookService],
})
export class AgentDepositModule {}
