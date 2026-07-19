import { Module } from '@nestjs/common';
import { OrderEventRepository } from './repositories/order-event.repository';
import { OrderEventService } from './services/order-event.service';

@Module({
  providers: [OrderEventRepository, OrderEventService],
  exports: [OrderEventService],
})
export class OrderEventModule {}
