import { Injectable } from '@nestjs/common';
import { OrderPaymentStatus, PaymentRecordStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { OrderRepository } from '../../order/repositories/order.repository';
import { PaymentRepository } from '../repositories/payment.repository';

@Injectable()
export class PaymentExpirationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentRepository: PaymentRepository,
    private readonly orderRepository: OrderRepository,
  ) {}

  async expirePayment(paymentId: string): Promise<boolean> {
    const payment = await this.paymentRepository.findById(paymentId);
    if (!payment || payment.status !== PaymentRecordStatus.PENDING) {
      return false;
    }
    if (!payment.expiresAt || payment.expiresAt.getTime() >= Date.now()) {
      return false;
    }

    await this.prisma.$transaction(async (tx) => {
      await this.paymentRepository.updateStatus(
        paymentId,
        PaymentRecordStatus.EXPIRED,
        undefined,
        tx,
      );

      const order = await tx.order.findUnique({
        where: { id: payment.orderId },
        select: { paymentStatus: true },
      });

      if (order?.paymentStatus === OrderPaymentStatus.WAITING_PAYMENT) {
        await this.orderRepository.updatePaymentStatus(
          payment.orderId,
          OrderPaymentStatus.EXPIRED,
          tx,
        );
      }
    });

    return true;
  }

  async expireDuePayments(now = new Date()): Promise<number> {
    const due = await this.paymentRepository.findPendingExpired(now);
    let count = 0;
    for (const payment of due) {
      const expired = await this.expirePayment(payment.id);
      if (expired) {
        count += 1;
      }
    }
    return count;
  }
}
