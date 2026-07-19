import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/app-config.module';
import { DatabaseModule } from './database/database.module';
import { LoggerModule } from './logger/logger.module';
import { NotificationModule } from './modules/notification/notification.module';
import { SystemHealthModule } from './modules/admin/system-health.module';
import { OrderModule } from './modules/order/order.module';
import { PaymentModule } from './modules/payment/payment.module';
import { ProductModule } from './modules/product/product.module';
import { ProviderModule } from './modules/provider/provider.module';
import { SettingsModule } from './modules/settings/settings.module';
import { WebhookDeliveryModule } from './modules/webhook-delivery/webhook-delivery.module';
import { QueueModule } from './queue/queue.module';
import { WorkerHeartbeatService } from './queue/worker-heartbeat.service';

/**
 * Minimal Nest context for BullMQ workers — no HTTP controllers.
 * Run via: APP_ROLE=worker node dist/worker.js
 */
@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    QueueModule,
    LoggerModule,
    ProductModule,
    SettingsModule,
    OrderModule,
    PaymentModule,
    ProviderModule,
    NotificationModule,
    SystemHealthModule,
    WebhookDeliveryModule,
  ],
  providers: [WorkerHeartbeatService],
})
export class WorkerAppModule {}
