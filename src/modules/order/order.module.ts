import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';
import { ProductModule } from '../product/product.module';
import { ProviderModule } from '../provider/provider.module';
import { OrderController } from './controllers/order.controller';
import { OrderEventModule } from './order-event.module';
import { MaintenanceCenterModule } from '../maintenance-center/maintenance-center.module';
import { OrderRepository } from './repositories/order.repository';
import { OrderAuditService } from './services/order-audit.service';
import { OrderDeliveryService } from './services/order-delivery.service';
import { OrderExpirationService } from './services/order-expiration.service';
import { OrderService } from './services/order.service';
import { EsimModule } from '../esim/esim.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    AuthModule,
    ProductModule,
    ProviderModule,
    SettingsModule,
    OrderEventModule,
    MaintenanceCenterModule,
    forwardRef(() => NotificationModule),
    /** Required so OrderService can delegate eSIM creates to EsimOrderService. */
    forwardRef(() => EsimModule),
  ],
  controllers: [OrderController],
  providers: [
    OrderRepository,
    OrderService,
    OrderDeliveryService,
    OrderAuditService,
    OrderExpirationService,
  ],
  exports: [
    OrderService,
    OrderDeliveryService,
    OrderExpirationService,
    OrderRepository,
    OrderEventModule,
  ],
})
export class OrderModule {}
