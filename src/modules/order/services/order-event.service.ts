import { Injectable } from '@nestjs/common';
import { OrderEventType, Prisma } from '@prisma/client';
import { OrderEventRepository } from '../repositories/order-event.repository';

@Injectable()
export class OrderEventService {
  constructor(private readonly repository: OrderEventRepository) {}

  record(
    orderId: string,
    eventType: OrderEventType,
    message: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    return this.repository.create({ orderId, eventType, message, metadata });
  }

  listByOrderId(orderId: string) {
    return this.repository.listByOrderId(orderId);
  }
}
