import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { AgentSecurityCenterModule } from '../agent-security-center/agent-security-center.module';
import { ApiObservabilityModule } from '../api-observability/api-observability.module';
import { WebhookDeliveryModule } from '../webhook-delivery/webhook-delivery.module';
import { MaintenanceCenterModule } from '../maintenance-center/maintenance-center.module';
import { ProductModule } from '../product/product.module';
import { ProviderModule } from '../provider/provider.module';
import { AgentApiController } from './controllers/agent-api.controller';
import { AgentApiAuthGuard, AgentApiRateLimitGuard } from './guards/agent-api-auth.guard';
import { AgentApiLoggingInterceptor } from '../api-observability/interceptors/agent-api-logging.interceptor';
import { AgentApiRepository } from './repositories/agent-api.repository';
import { AgentApiAuthService } from './services/agent-api-auth.service';
import { AgentApiBuyService } from './services/agent-api-buy.service';
import { AgentApiCatalogService } from './services/agent-api-catalog.service';

@Module({
  imports: [AgentModule, AgentSecurityCenterModule, ProductModule, ProviderModule, MaintenanceCenterModule, ApiObservabilityModule, WebhookDeliveryModule],
  controllers: [AgentApiController],
  providers: [
    AgentApiRepository,
    AgentApiAuthService,
    AgentApiBuyService,
    AgentApiCatalogService,
    AgentApiAuthGuard,
    AgentApiRateLimitGuard,
    AgentApiLoggingInterceptor,
  ],
  exports: [AgentApiBuyService, AgentApiAuthService],
})
export class AgentApiModule {}
