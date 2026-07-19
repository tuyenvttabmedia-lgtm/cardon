import { Module } from '@nestjs/common';
import { shouldRegisterWorkers } from '../../config/process-role';
import { ActivityEventModule } from '../activity-event/activity-event.module';
import { AgentModule } from '../agent/agent.module';
import { AgentApiRepository } from '../agent-api/repositories/agent-api.repository';
import { AgentPlatformModule } from '../agent-platform/agent-platform.module';
import { NotificationModule } from '../notification/notification.module';
import { ProviderModule } from '../provider/provider.module';
import { AgentWebhookDeliveryController } from './controllers/agent-webhook-delivery.controller';
import { WebhookDeliveryRepository } from './repositories/webhook-delivery.repository';
import { WebhookDeliveryPayloadService } from './services/webhook-delivery-payload.service';
import { WebhookDeliveryProducer } from './services/webhook-delivery-producer.service';
import { WebhookDeliveryService } from './services/webhook-delivery.service';
import { WebhookDeliveryWorker } from './workers/webhook-delivery.worker';

const workerProviders = shouldRegisterWorkers() ? [WebhookDeliveryWorker] : [];

@Module({
  imports: [AgentModule, AgentPlatformModule, ProviderModule, NotificationModule, ActivityEventModule],
  controllers: [AgentWebhookDeliveryController],
  providers: [
    WebhookDeliveryRepository,
    WebhookDeliveryPayloadService,
    WebhookDeliveryProducer,
    WebhookDeliveryService,
    AgentApiRepository,
    ...workerProviders,
  ],
  exports: [WebhookDeliveryService, WebhookDeliveryRepository],
})
export class WebhookDeliveryModule {}
