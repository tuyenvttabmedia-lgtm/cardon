import { Module, forwardRef } from '@nestjs/common';
import { ActivityEventModule } from '../activity-event/activity-event.module';
import { AdminModule } from '../admin/admin.module';
import { AuthModule } from '../auth/auth.module';
import { FinanceModule } from '../finance/finance.module';
import { RbacModule } from '../rbac/rbac.module';
import { WebhookMonitorModule } from '../webhook-monitor/webhook-monitor.module';
import { OperationsCenterController } from './controllers/operations-center.controller';
import { OperationsCenterService } from './services/operations-center.service';
import { OperationsManualService } from './services/operations-manual.service';

@Module({
  imports: [
    AuthModule,
    RbacModule,
    ActivityEventModule,
    forwardRef(() => FinanceModule),
    forwardRef(() => AdminModule),
    WebhookMonitorModule,
  ],
  controllers: [OperationsCenterController],
  providers: [OperationsCenterService, OperationsManualService],
  exports: [OperationsCenterService],
})
export class OperationsCenterModule {}
