import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AppConfigModule } from './config/app-config.module';
import { DatabaseModule } from './database/database.module';
import { LoggerModule } from './logger/logger.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { OrderModule } from './modules/order/order.module';
import { PaymentModule } from './modules/payment/payment.module';
import { ProviderModule } from './modules/provider/provider.module';
import { AgentModule } from './modules/agent/agent.module';
import { AdminModule } from './modules/admin/admin.module';
import { FinanceModule } from './modules/finance/finance.module';
import { NotificationModule } from './modules/notification/notification.module';
import { AgentApiModule } from './modules/agent-api/agent-api.module';
import { ProductModule } from './modules/product/product.module';
import { CmsModule } from './modules/cms/cms.module';
import { FaqModule } from './modules/faq/faq.module';
import { ContactModule } from './modules/contact/contact.module';
import { SupportModule } from './modules/support/support.module';
import { SettingsModule } from './modules/settings/settings.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { ActivityEventModule } from './modules/activity-event/activity-event.module';
import { ActivityLogModule } from './modules/activity-log/activity-log.module';
import { NotificationCenterModule } from './modules/notification-center/notification-center.module';
import { QueueMonitorModule } from './modules/queue-monitor/queue-monitor.module';
import { ConfigurationCenterModule } from './modules/configuration-center/configuration-center.module';
import { MaintenanceCenterModule } from './modules/maintenance-center/maintenance-center.module';
import { AgentOrganizationModule } from './modules/agent-organization/agent-organization.module';
import { AgentPlatformModule } from './modules/agent-platform/agent-platform.module';
import { AgentSecurityCenterModule } from './modules/agent-security-center/agent-security-center.module';
import { AgentDepositModule } from './modules/agent-deposit/agent-deposit.module';
import { WebhookMonitorModule } from './modules/webhook-monitor/webhook-monitor.module';
import { OperationsCenterModule } from './modules/operations-center/operations-center.module';
import { CustomerCenterModule } from './modules/customer-center/customer-center.module';
import { WebhookDeliveryModule } from './modules/webhook-delivery/webhook-delivery.module';
import { ApiObservabilityModule } from './modules/api-observability/api-observability.module';
import { AdminAgentCenterModule } from './modules/admin-agent-center/admin-agent-center.module';
import { CorrelationIdMiddleware } from './modules/audit-log/middleware/correlation-id.middleware';
import { QueueModule } from './queue/queue.module';
import { WorkerHeartbeatService } from './queue/worker-heartbeat.service';
import { shouldRegisterWorkers } from './config/process-role';

const workerProviders = shouldRegisterWorkers() ? [WorkerHeartbeatService] : [];

@Module({
  imports: [
    AppConfigModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),
    DatabaseModule,
    QueueModule,
    LoggerModule,
    RbacModule,
    HealthModule,
    AuthModule,
    ProductModule,
    CmsModule,
    FaqModule,
    ContactModule,
    SupportModule,
    SettingsModule,
    OrderModule,
    PaymentModule,
    AgentDepositModule,
    ProviderModule,
    AgentModule,
    AgentApiModule,
    AdminModule,
    FinanceModule,
    NotificationModule,
    AuditLogModule,
    ActivityEventModule,
    ActivityLogModule,
    NotificationCenterModule,
    QueueMonitorModule,
    WebhookMonitorModule,
    OperationsCenterModule,
    ConfigurationCenterModule,
    MaintenanceCenterModule,
    AgentPlatformModule,
    AgentOrganizationModule,
    AgentSecurityCenterModule,
    AdminAgentCenterModule,
    CustomerCenterModule,
    WebhookDeliveryModule,
    ApiObservabilityModule,
  ],
  providers: [
    ...workerProviders,
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
