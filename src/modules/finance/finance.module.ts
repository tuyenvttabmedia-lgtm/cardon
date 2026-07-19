import { Module, forwardRef } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { ProviderModule } from '../provider/provider.module';

import { FinanceController } from './controllers/finance.controller';

import { FinanceRepository } from './repositories/finance.repository';

import { ProviderOperationsRepository } from './repositories/provider-operations.repository';

import { AgentStatementService } from './services/agent-statement.service';

import { ExportService } from './services/export.service';

import { FinanceAuditService } from './services/finance-audit.service';

import { GatewayFeesService } from './services/gateway-fees.service';

import { GatewayInvoiceService } from './services/gateway-invoice.service';

import { InvoiceService } from './services/invoice.service';

import { PaymentReconcileService } from './services/payment-reconcile.service';

import { PaymentSettlementService } from './services/payment-settlement.service';

import { ProfitService } from './services/profit.service';

import { ProviderDailyReconciliationService } from './services/provider-daily-reconciliation.service';

import { ProviderOperationsService } from './services/provider-operations.service';

import { ProviderReconcileService } from './services/provider-reconcile.service';

import { ReconcileReportService } from './services/reconcile-report.service';



@Module({

  imports: [AuthModule, forwardRef(() => ProviderModule)],

  controllers: [FinanceController],

  providers: [

    FinanceRepository,

    ProviderOperationsRepository,

    FinanceAuditService,

    PaymentReconcileService,

    ProviderReconcileService,

    ProviderDailyReconciliationService,

    ProviderOperationsService,

    ReconcileReportService,

    ProfitService,

    GatewayFeesService,

    PaymentSettlementService,

    GatewayInvoiceService,

    AgentStatementService,

    InvoiceService,

    ExportService,

  ],

  exports: [FinanceRepository, FinanceAuditService, InvoiceService, AgentStatementService, ExportService],

})

export class FinanceModule {}


