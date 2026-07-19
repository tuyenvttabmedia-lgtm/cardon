import { Injectable } from '@nestjs/common';
import { CardAccessAction } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class CardAccessLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    cardId: string;
    orderId: string;
    adminId: string;
    action: CardAccessAction;
    reason?: string;
    ip?: string | null;
    userAgent?: string | null;
  }) {
    return this.prisma.cardAccessLog.create({
      data: {
        cardId: data.cardId,
        orderId: data.orderId,
        adminId: data.adminId,
        action: data.action,
        reason: data.reason?.trim() || 'admin_api',
        ip: data.ip ?? null,
        userAgent: data.userAgent ?? null,
      },
    });
  }

  findByOrderId(orderId: string) {
    return this.prisma.cardAccessLog.findMany({
      where: { orderId, action: CardAccessAction.VIEW_PIN },
      include: {
        admin: { select: { id: true, email: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
