import { Injectable } from '@nestjs/common';
import {
  NotificationRecipientRole,
  NotificationRecipientType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  createSystemNotification(params: {
    recipientType: NotificationRecipientType;
    recipientId?: string;
    recipientRole?: NotificationRecipientRole;
    type: string;
    title: string;
    body: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return this.prisma.notification.create({
      data: {
        recipientType: params.recipientType,
        recipientId: params.recipientId,
        recipientRole: params.recipientRole,
        type: params.type,
        title: params.title,
        body: params.body,
        metadata: params.metadata ?? {},
      },
    });
  }

  findOrderForEmail(orderId: string) {
    return this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      include: {
        user: { select: { id: true, email: true } },
        orderItems: {
          include: {
            variant: { select: { sku: true, name: true, type: true } },
            cardRecords: {
              select: {
                id: true,
                encryptedSerial: true,
                encryptedPin: true,
              },
            },
          },
        },
      },
    });
  }

  findAgentForEmail(agentId: string) {
    return this.prisma.agent.findFirst({
      where: { id: agentId, deletedAt: null },
      include: {
        user: { select: { id: true, email: true } },
      },
    });
  }

  findProviderForEmail(providerId: string) {
    return this.prisma.provider.findFirst({
      where: { id: providerId, deletedAt: null },
    });
  }

  findPaymentForEmail(paymentId: string) {
    return this.prisma.payment.findFirst({
      where: { id: paymentId, deletedAt: null },
      include: {
        order: {
          select: {
            id: true,
            orderCode: true,
            totalAmount: true,
            guestEmail: true,
            user: { select: { email: true } },
          },
        },
      },
    });
  }

  listForUser(userId: string, take = 100) {
    return this.prisma.notification.findMany({
      where: {
        recipientType: NotificationRecipientType.USER,
        recipientId: userId,
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  countUnreadForUser(userId: string) {
    return this.prisma.notification.count({
      where: {
        recipientType: NotificationRecipientType.USER,
        recipientId: userId,
        readAt: null,
      },
    });
  }

  markReadForUser(notificationId: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        recipientType: NotificationRecipientType.USER,
        recipientId: userId,
      },
      data: { readAt: new Date() },
    });
  }

  markAllReadForUser(userId: string) {
    return this.prisma.notification.updateMany({
      where: {
        recipientType: NotificationRecipientType.USER,
        recipientId: userId,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
  }

  deleteForUser(notificationId: string, userId: string) {
    return this.prisma.notification.deleteMany({
      where: {
        id: notificationId,
        recipientType: NotificationRecipientType.USER,
        recipientId: userId,
      },
    });
  }

  listForAdminRole(take = 50) {
    return this.prisma.notification.findMany({
      where: {
        recipientType: NotificationRecipientType.ADMIN_ROLE,
        recipientRole: NotificationRecipientRole.ADMIN,
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  countUnreadForAdminRole() {
    return this.prisma.notification.count({
      where: {
        recipientType: NotificationRecipientType.ADMIN_ROLE,
        recipientRole: NotificationRecipientRole.ADMIN,
        readAt: null,
      },
    });
  }

  markReadForAdminRole(notificationId: string) {
    return this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        recipientType: NotificationRecipientType.ADMIN_ROLE,
        recipientRole: NotificationRecipientRole.ADMIN,
      },
      data: { readAt: new Date() },
    });
  }
}
