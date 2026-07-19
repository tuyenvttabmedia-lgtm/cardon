import { Module } from '@nestjs/common';
import { ActivityEventModule } from '../activity-event/activity-event.module';
import { AgentDepositModule } from '../agent-deposit/agent-deposit.module';
import { AgentModule } from '../agent/agent.module';
import { NotificationModule } from '../notification/notification.module';
import { ProductModule } from '../product/product.module';
import { ProviderModule } from '../provider/provider.module';import { AgentOrganizationModule } from '../agent-organization/agent-organization.module';
import { AgentFinanceController } from './controllers/agent-finance.controller';
import { AgentOrderOperationsController } from './controllers/agent-order-operations.controller';
import { AgentPlatformController } from './controllers/agent-platform.controller';
import { AgentWalletController } from './controllers/agent-wallet.controller';
import { AgentFinanceService } from './services/agent-finance.service';
import { AgentOrderOperationsService } from './services/agent-order-operations.service';
import { AgentPlatformService } from './services/agent-platform.service';
import { AgentWalletService } from './services/agent-wallet.service';

@Module({
  imports: [AgentModule, AgentDepositModule, NotificationModule, ActivityEventModule, ProviderModule, ProductModule, AgentOrganizationModule],
  controllers: [
    AgentPlatformController,
    AgentWalletController,
    AgentFinanceController,
    AgentOrderOperationsController,
  ],
  providers: [AgentPlatformService, AgentWalletService, AgentFinanceService, AgentOrderOperationsService],
  exports: [AgentPlatformService, AgentWalletService, AgentFinanceService, AgentOrderOperationsService],
})
export class AgentPlatformModule {}
