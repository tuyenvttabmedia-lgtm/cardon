import { Injectable } from '@nestjs/common';
import { OrderPaymentStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { OrderRepository } from '../repositories/order.repository';
import { OrderAuditService } from './order-audit.service';

@Injectable()
export class OrderExpirationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderRepository: OrderRepository,
    private readonly orderAuditService: OrderAuditService,
  ) {}

  async expireOrder(orderId: string): Promise<boolean> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderCode: true,
        paymentStatus: true,
        paymentExpiresAt: true,
        deletedAt: true,
      },
    });

    if (!order || order.deletedAt) {
      return false;
    }

    if (order.paymentStatus !== OrderPaymentStatus.WAITING_PAYMENT) {
      return false;
    }

    if (!order.paymentExpiresAt || order.paymentExpiresAt.getTime() >= Date.now()) {
      return false;
    }

    await this.prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus: OrderPaymentStatus.EXPIRED },
    });

    await this.orderAuditService.recordOrderExpired({
      orderId,
      metadata: { orderCode: order.orderCode },
    });

    return true;
  }

  async expireDueOrders(now = new Date()): Promise<number> {
    const due = await this.orderRepository.findWaitingPaymentExpired(now);
    let expired = 0;

    for (const order of due) {
      const didExpire = await this.expireOrder(order.id);
      if (didExpire) {
        expired += 1;
      }
    }

    return expired;
  }
}
