import { Module } from '@nestjs/common';
import { ActivityEventModule } from '../activity-event/activity-event.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { PaymentModule } from '../payment/payment.module';
import { RbacModule } from '../rbac/rbac.module';
import { WebhookDeliveryModule } from '../webhook-delivery/webhook-delivery.module';
import { WebhookMonitorController } from './controllers/webhook-monitor.controller';
import { WebhookMonitorRepository } from './repositories/webhook-monitor.repository';
import { WebhookMonitorExportService } from './services/webhook-monitor-export.service';
import { WebhookMonitorService } from './services/webhook-monitor.service';

@Module({
  imports: [AuthModule, RbacModule, ActivityEventModule, AuditLogModule, PaymentModule, WebhookDeliveryModule],
  controllers: [WebhookMonitorController],
  providers: [WebhookMonitorRepository, WebhookMonitorService, WebhookMonitorExportService],
  exports: [WebhookMonitorService],
})
export class WebhookMonitorModule {}
