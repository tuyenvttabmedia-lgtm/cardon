import { Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettingsStoreService } from '../settings/services/settings-store.service';
import { shouldRegisterHttp, shouldRegisterWorkers } from '../../config/process-role';
import { OrderModule } from '../order/order.module';
import { ProductModule } from '../product/product.module';
import { ProviderModule } from '../provider/provider.module';
import { SettingsModule } from '../settings/settings.module';
import { NotificationModule } from '../notification/notification.module';
import { EsimQueueModule } from './esim-queue.module';
import { EsimAccountService } from './esim-account.service';
import { EsimAdminService } from './esim-admin.service';
import { EsimFulfillmentRepository } from './esim-fulfillment.repository';
import { EsimFulfillmentService } from './esim-fulfillment.service';
import { EsimCatalogSyncService, PrismaEsimCatalogueMappingStore } from './esim-catalog-sync.service';
import { EsimPublicCatalogService } from './esim-public-catalog.service';
import { EsimAiraloAdapter, FetchAiraloTransport, airaloHttpEnabled } from './esim-airalo.adapter';
import { EsimLiveAdapter } from './esim-live.adapter';
import { EsimMockAdapter } from './esim-mock.adapter';
import { EsimOrderService } from './esim-order.service';
import { ESIM_PROVIDER_PORT } from './esim-provider.port';
import { EsimController } from './esim.controller';
import { EsimAiraloWebhookController } from './esim-airalo-webhook.controller';
import { EsimWorker } from './esim.worker';
import { EsimAiraloProviderBootstrap } from './esim-airalo-provider.bootstrap';
import { EsimAiraloCatalogueRepository } from './esim-airalo-catalogue.repository';
import { EsimAiraloCatalogueService } from './esim-airalo-catalogue.service';
import { EsimAiraloCatalogueCronService } from './esim-airalo-catalogue.cron';
import { EsimAiraloWebhookService } from './esim-airalo-webhook.service';
import { EsimTopupService } from './esim-topup.service';
import { EsimQueryOpenCronService } from './esim-query-open.cron';

const workers = shouldRegisterWorkers() ? [EsimWorker, EsimQueryOpenCronService] : [];
const httpCrons = shouldRegisterHttp() ? [EsimAiraloCatalogueCronService] : [];
const httpControllers = shouldRegisterHttp()
  ? [EsimController, EsimAiraloWebhookController]
  : [EsimController];

@Module({
  imports: [
    EsimQueueModule,
    forwardRef(() => OrderModule),
    forwardRef(() => ProviderModule),
    ProductModule,
    SettingsModule,
    forwardRef(() => NotificationModule),
  ],
  controllers: httpControllers,
  providers: [
    EsimOrderService,
    EsimFulfillmentRepository,
    EsimFulfillmentService,
    EsimMockAdapter,
    EsimLiveAdapter,
    {
      provide: EsimAiraloAdapter,
      useFactory: (config: ConfigService, settings: SettingsStoreService) => {
        const clientId = config.get<string>('airalo.clientId') ?? '';
        const clientSecret = config.get<string>('airalo.clientSecret') ?? '';
        const liveArm = config.get<boolean>('esim.liveArm') === true;
        return new EsimAiraloAdapter(config, {
          credentials: settings,
          httpEnabled: airaloHttpEnabled(liveArm, clientId, clientSecret),
          transport: new FetchAiraloTransport(),
        });
      },
      inject: [ConfigService, SettingsStoreService],
    },
    PrismaEsimCatalogueMappingStore,
    EsimCatalogSyncService,
    EsimPublicCatalogService,
    { provide: ESIM_PROVIDER_PORT, useExisting: EsimAiraloAdapter },
    EsimAccountService,
    EsimAdminService,
    EsimAiraloWebhookService,
    EsimTopupService,
    EsimAiraloProviderBootstrap,
    EsimAiraloCatalogueRepository,
    EsimAiraloCatalogueService,
    ...httpCrons,
    ...workers,
  ],
  exports: [
    EsimOrderService,
    EsimAdminService,
    EsimFulfillmentService,
    EsimQueueModule,
    EsimAiraloAdapter,
    EsimAiraloCatalogueService,
    EsimTopupService,
  ],
})
export class EsimModule {}
