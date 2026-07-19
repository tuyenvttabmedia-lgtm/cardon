import { Module, forwardRef } from '@nestjs/common';

import { shouldRegisterWorkers } from '../../config/process-role';

import { AuthModule } from '../auth/auth.module';

import { ActivityEventModule } from '../activity-event/activity-event.module';

import { NotificationModule } from '../notification/notification.module';

import { ProductModule } from '../product/product.module';

import { EsaleConfigService } from './adapters/esale/esale.config';

import { EsaleHttpClient } from './adapters/esale/esale.client';

import { EsaleCardAdapter } from './adapters/esale/esale-card.adapter';

import { EsaleTopupAdapter } from './adapters/esale/esale-topup.adapter';

import { ESaleProvider } from './adapters/esale/esale.provider';

import { MockESaleProvider } from './adapters/mock-esale.provider';

import { MockIMediaProvider } from './adapters/mock-imedia.provider';

import { ProviderController } from './controllers/provider.controller';

import { ProviderBalanceRepository } from './repositories/provider-balance.repository';

import {

  CardRecordRepository,

  ProviderOrderRepository,

  ProviderRepository,

  ProviderTransactionRepository,

  TopupTransactionRepository,

} from './repositories/provider.repository';

import { CardEncryptionService } from './services/card-encryption.service';

import { FulfillmentDispatchService } from './services/fulfillment-dispatch.service';

import { ProviderAuditService } from './services/provider-audit.service';

import { ProviderBalanceCronService } from './services/provider-balance-cron.service';

import { ProviderHealthService } from './services/provider-health.service';

import {
  ProviderAutoProtectionService,
  ProviderHealthMonitorService,
} from './services/provider-health-monitor.service';

import { ProviderCostHistoryRepository } from './repositories/provider-cost-history.repository';

import { ProviderRuntimeSettingsRepository } from './repositories/provider-runtime-settings.repository';

import { OrderEventModule } from '../order/order-event.module';

import { ProviderProductSyncService } from './services/provider-product-sync.service';

import { ProviderQueueProducer } from './services/provider-queue.producer';

import { ProviderRegistryService } from './services/provider-registry.service';

import { ProviderService } from './services/provider.service';

import { TopupQueueProducer } from './services/topup-queue.producer';

import { TopupService } from './services/topup.service';

import { ProviderWorker } from './workers/provider.worker';

import { TopupWorker } from './workers/topup.worker';



const workerProviders = shouldRegisterWorkers() ? [ProviderWorker, TopupWorker] : [];



@Module({

  imports: [forwardRef(() => AuthModule), forwardRef(() => ProductModule), forwardRef(() => NotificationModule), OrderEventModule, ActivityEventModule],

  controllers: [ProviderController],

  providers: [

    EsaleConfigService,

    EsaleHttpClient,

    EsaleCardAdapter,

    EsaleTopupAdapter,

    ProviderProductSyncService,

    ESaleProvider,

    MockESaleProvider,

    MockIMediaProvider,

    ProviderRepository,

    ProviderBalanceRepository,

    ProviderOrderRepository,

    ProviderTransactionRepository,

    TopupTransactionRepository,

    CardRecordRepository,

    CardEncryptionService,

    ProviderRegistryService,

    ProviderAuditService,

    ProviderHealthService,

    ProviderHealthMonitorService,

    ProviderAutoProtectionService,

    ProviderCostHistoryRepository,

    ProviderRuntimeSettingsRepository,

    ProviderBalanceCronService,

    ProviderService,

    TopupService,

    FulfillmentDispatchService,

    ProviderQueueProducer,

    TopupQueueProducer,

    ...workerProviders,

  ],

  exports: [

    ProviderService,

    TopupService,

    FulfillmentDispatchService,

    ProviderQueueProducer,

    TopupQueueProducer,

    ProviderRegistryService,

    CardEncryptionService,

    ProviderHealthService,

    ProviderHealthMonitorService,

    ProviderRuntimeSettingsRepository,

    ProviderRepository,

    ProviderBalanceRepository,

    ProviderTransactionRepository,

    EsaleHttpClient,

    EsaleCardAdapter,

  ],

})

export class ProviderModule {}


