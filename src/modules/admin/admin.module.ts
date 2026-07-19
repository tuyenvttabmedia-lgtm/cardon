import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AgentModule } from '../agent/agent.module';
import { ProductModule } from '../product/product.module';
import { OrderModule } from '../order/order.module';
import { OrderEventModule } from '../order/order-event.module';
import { PaymentModule } from '../payment/payment.module';
import { ProviderModule } from '../provider/provider.module';
import { NotificationModule } from '../notification/notification.module';
import { SettingsModule } from '../settings/settings.module';
import { RbacModule } from '../rbac/rbac.module';
import { QueueModule } from '../../queue/queue.module';
import { SystemHealthModule } from './system-health.module';
import { AdminController } from './controllers/admin.controller';
import { AdminMeController } from './controllers/admin-me.controller';
import { AdminOperationController } from './controllers/admin-operation.controller';
import { SettingsAdminController } from './controllers/settings-admin.controller';
import { SystemHealthController } from './controllers/system-health.controller';
import { AdminRepository } from './repositories/admin.repository';
import { AdminAgentInviteService } from './services/admin-agent-invite.service';
import { AdminAgentService } from './services/admin-agent.service';
import { AdminAuditLogService } from './services/admin-audit-log.service';
import { AdminAuditService } from './services/admin-audit.service';
import { AdminCustomerService } from './services/admin-customer.service';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { AdminOrderDetailService } from './services/admin-order-detail.service';
import { CardAccessLogRepository } from './repositories/card-access-log.repository';
import { AdminOrderService } from './services/admin-order.service';
import { AdminPaymentService } from './services/admin-payment.service';
import { AdminProviderService } from './services/admin-provider.service';
import { AdminSearchService } from './services/admin-search.service';
import { AdminStaffService } from './services/admin-staff.service';
import { SettingsAdminService } from './services/settings-admin.service';
import { AdminNotificationService } from './services/admin-notification.service';

@Module({
  imports: [SettingsModule, AuthModule, RbacModule, ProductModule, OrderModule, OrderEventModule, PaymentModule, ProviderModule, AgentModule, NotificationModule, QueueModule, SystemHealthModule],
  controllers: [AdminController, AdminMeController, AdminOperationController, SettingsAdminController, SystemHealthController],
  providers: [
    AdminRepository,
    AdminAuditService,
    AdminDashboardService,
    AdminOrderService,
    AdminOrderDetailService,
    CardAccessLogRepository,
    AdminPaymentService,
    AdminProviderService,
    AdminAgentService,
    AdminAuditLogService,
    AdminSearchService,
    AdminCustomerService,
    AdminStaffService,
    AdminAgentInviteService,
    SettingsAdminService,
    AdminNotificationService,
  ],
  exports: [AdminAuditService, SettingsAdminService, AdminOrderService],
})
export class AdminModule {}
