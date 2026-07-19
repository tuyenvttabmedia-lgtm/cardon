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

@Module({
  imports: [
    AuthModule,
    ProductModule,
    ProviderModule,
    OrderEventModule,
    MaintenanceCenterModule,
    forwardRef(() => NotificationModule),
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
