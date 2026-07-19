import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { AgentModule } from '../agent/agent.module';
import { AgentDepositModule } from '../agent-deposit/agent-deposit.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { FinanceModule } from '../finance/finance.module';
import { ProductModule } from '../product/product.module';
import { RbacModule } from '../rbac/rbac.module';
import { AdminAgentCenterController } from './controllers/admin-agent-center.controller';
import { AdminAgentStatementController } from './controllers/admin-agent-statement.controller';
import { AdminAgentWalletController } from './controllers/admin-agent-wallet.controller';
import { AdminAgentCenterService } from './services/admin-agent-center.service';
import { AdminAgentStatementCenterService } from './services/admin-agent-statement-center.service';
import { AdminAgentWalletService } from './services/admin-agent-wallet.service';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    RbacModule,
    ProductModule,
    AgentModule,
    AgentDepositModule,
    AuditLogModule,
    FinanceModule,
  ],
  controllers: [AdminAgentCenterController, AdminAgentStatementController, AdminAgentWalletController],
  providers: [AdminAgentCenterService, AdminAgentStatementCenterService, AdminAgentWalletService],
  exports: [AdminAgentCenterService, AdminAgentStatementCenterService, AdminAgentWalletService],
})
export class AdminAgentCenterModule {}
