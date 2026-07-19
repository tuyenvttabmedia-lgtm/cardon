import { Injectable } from '@nestjs/common';
import { OrderEventType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class OrderEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    orderId: string;
    eventType: OrderEventType;
    message: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return this.prisma.orderEvent.create({ data });
  }

  listByOrderId(orderId: string) {
    return this.prisma.orderEvent.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
