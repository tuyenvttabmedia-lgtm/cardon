import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';
import { OrderModule } from '../order/order.module';
import { ProviderModule } from '../provider/provider.module';
import { CustomerCenterController } from './controllers/customer-center.controller';
import { CustomerCenterService } from './services/customer-center.service';

@Module({
  imports: [AuthModule, OrderModule, NotificationModule, ProviderModule],
  controllers: [CustomerCenterController],
  providers: [CustomerCenterService],
  exports: [CustomerCenterService],
})
export class CustomerCenterModule {}
