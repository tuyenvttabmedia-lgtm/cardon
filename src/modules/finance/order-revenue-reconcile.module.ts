import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationCenterModule } from '../notification-center/notification-center.module';
import { PaymentModule } from '../payment/payment.module';
import { RbacModule } from '../rbac/rbac.module';
import { OrderRevenueReconcileController } from './controllers/order-revenue-reconcile.controller';
import { FinanceRepository } from './repositories/finance.repository';
import { OrderRevenueReconcileCronService } from './services/order-revenue-reconcile-cron.service';
import { OrderRevenueReconcileService } from './services/order-revenue-reconcile.service';

/**
 * Daily Order/Payment/Provider/MegaPay scan.
 * Imported by both API (manual endpoint) and worker (cron).
 */
@Module({
  imports: [AuthModule, RbacModule, PaymentModule, NotificationCenterModule],
  controllers: [OrderRevenueReconcileController],
  providers: [
    FinanceRepository,
    OrderRevenueReconcileService,
    OrderRevenueReconcileCronService,
  ],
  exports: [OrderRevenueReconcileService],
})
export class OrderRevenueReconcileModule {}
