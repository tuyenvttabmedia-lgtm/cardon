import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FulfillmentStatus,
  OrderEventType,
  OrderPaymentStatus,
  ProductVariantType,
  SupportTicketStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { AccountService } from '../../auth/services/account.service';
import { resolveCustomerOrderStatus } from '../../order/entities/customer-order-status.util';
import { OrderDeliveryService } from '../../order/services/order-delivery.service';
import { CardEncryptionService } from '../../provider/services/card-encryption.service';
import { NotificationService } from '../../notification/services/notification.service';
import {
  CustomerNotificationQueryDto,
  CustomerOrderListQueryDto,
  CustomerPinListQueryDto,
} from '../dto/customer-list-query.dto';
import { inferCustomerNotificationGroup } from '../utils/notification-group.util';

@Injectable()
export class CustomerCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountService: AccountService,
    private readonly orderDeliveryService: OrderDeliveryService,
    private readonly notificationService: NotificationService,
    private readonly cardEncryption: CardEncryptionService,
  ) {}

  private startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  async getDashboard(userId: string) {
    const startOfDay = this.startOfToday();
    const user = await this.prisma.user.findFirst({
      where: { id: userId, role: UserRole.CUSTOMER, deletedAt: null },
      select: { lastLoginAt: true },
    });

    const [
      ordersToday,
      successToday,
      processingToday,
      pinCount,
      unreadNotifications,
      recentOrders,
      recentNotifications,
    ] = await Promise.all([
      this.prisma.order.count({
        where: { userId, deletedAt: null, createdAt: { gte: startOfDay } },
      }),
      this.prisma.order.count({
        where: {
          userId,
          deletedAt: null,
          createdAt: { gte: startOfDay },
          fulfillmentStatus: FulfillmentStatus.COMPLETED,
        },
      }),
      this.prisma.order.count({
        where: {
          userId,
          deletedAt: null,
          OR: [
            { paymentStatus: OrderPaymentStatus.WAITING_PAYMENT },
            {
              paymentStatus: OrderPaymentStatus.PAID,
              fulfillmentStatus: {
                in: [
                  FulfillmentStatus.PENDING,
                  FulfillmentStatus.PROCESSING,
                  FulfillmentStatus.WAITING_ADMIN_RETRY,
                  FulfillmentStatus.NEED_MANUAL_REVIEW,
                ],
              },
            },
          ],
        },
      }),
      this.countPins(userId),
      this.notificationService.countUnreadUserNotifications(userId),
      this.listOrders(userId, { take: 5, skip: 0 }),
      this.listNotifications(userId, { take: 5, skip: 0, group: 'all' }),
    ]);

    const recentPins = await this.listPins(userId, { take: 5, skip: 0 });

    return {
      cards: {
        ordersToday,
        successToday,
        processingToday,
        pinCount,
        unreadNotifications,
        lastLoginAt: user?.lastLoginAt?.toISOString() ?? null,
      },
      recent: {
        orders: recentOrders.items,
        pins: recentPins.items,
        notifications: recentNotifications.items,
      },
    };
  }

  private async countPins(userId: string) {
    return this.prisma.cardRecord.count({
      where: {
        orderItem: {
          order: {
            userId,
            deletedAt: null,
            paymentStatus: OrderPaymentStatus.PAID,
            fulfillmentStatus: FulfillmentStatus.COMPLETED,
          },
        },
      },
    });
  }

  async listOrders(userId: string, query: CustomerOrderListQueryDto) {
    const skip = query.skip ?? 0;
    const take = Math.min(query.take ?? 20, 100);
    const tab = query.tab ?? 'all';
    const and: Record<string, unknown>[] = [{ userId, deletedAt: null }];

    if (query.q?.trim()) {
      const q = query.q.trim();
      and.push({
        OR: [
          { orderCode: { contains: q, mode: 'insensitive' } },
          { payments: { some: { paymentReference: { contains: q, mode: 'insensitive' } } } },
        ],
      });
    }

    if (tab === 'processing') {
      and.push({
        OR: [
          { paymentStatus: OrderPaymentStatus.WAITING_PAYMENT },
          {
            paymentStatus: OrderPaymentStatus.PAID,
            fulfillmentStatus: {
              in: [
                FulfillmentStatus.PENDING,
                FulfillmentStatus.PROCESSING,
                FulfillmentStatus.WAITING_ADMIN_RETRY,
                FulfillmentStatus.NEED_MANUAL_REVIEW,
              ],
            },
          },
        ],
      });
    } else if (tab === 'completed') {
      and.push({ fulfillmentStatus: FulfillmentStatus.COMPLETED });
    }

    if (query.type) {
      and.push({ orderItems: { some: { variant: { type: query.type as ProductVariantType } } } });
    }

    if (query.from || query.to) {
      and.push({
        createdAt: {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lte: new Date(query.to) } : {}),
        },
      });
    }

    const where = { AND: and };

    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          orderCode: true,
          totalAmount: true,
          paymentStatus: true,
          fulfillmentStatus: true,
          paymentGateway: true,
          createdAt: true,
          orderItems: {
            select: {
              quantity: true,
              variant: { select: { name: true, type: true, product: { select: { name: true } } } },
            },
          },
          payments: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: { id: true, paymentReference: true, gateway: true, status: true },
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items: rows.map((order) => ({
        id: order.id,
        orderCode: order.orderCode,
        totalAmount: order.totalAmount.toString(),
        paymentStatus: order.paymentStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        customerStatus: resolveCustomerOrderStatus(order.paymentStatus, order.fulfillmentStatus),
        paymentGateway: order.paymentGateway,
        createdAt: order.createdAt.toISOString(),
        payment: order.payments[0] ?? null,
        items: order.orderItems.map((item) => ({
          productName: item.variant?.product?.name ?? item.variant?.name ?? 'Sản phẩm',
          variantName: item.variant?.name ?? '',
          variantType: item.variant?.type ?? 'CARD',
          quantity: item.quantity,
        })),
      })),
      total,
      skip,
      take,
    };
  }

  async getOrderDetail(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId, deletedAt: null },
      include: {
        payments: { orderBy: { createdAt: 'desc' } },
        orderItems: {
          include: {
            variant: { select: { name: true, type: true, sku: true, product: { select: { name: true } } } },
          },
        },
      },
    });
    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }

    const delivery = await this.orderDeliveryService.getCustomerDelivery(orderId, userId);
    const emailEvents = await this.prisma.orderEvent.findMany({
      where: {
        orderId,
        eventType: { in: [OrderEventType.EMAIL_SENT, OrderEventType.ORDER_DELIVERED] },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return {
      order: delivery.order,
      timeline: delivery.timeline,
      delivery: delivery.delivery,
      payment: order.payments[0]
        ? {
            id: order.payments[0].id,
            reference: order.payments[0].paymentReference,
            gateway: order.payments[0].gateway,
            status: order.payments[0].status,
            paidAt: order.payments[0].paidAt?.toISOString() ?? null,
          }
        : null,
      product: order.orderItems.map((item) => ({
        name: item.variant?.product?.name ?? item.variant?.name,
        variant: item.variant?.name,
        sku: item.variant?.sku,
        quantity: item.quantity,
        type: item.variant?.type,
      })),
      emailHistory: emailEvents.map((e) => ({
        at: e.createdAt.toISOString(),
        type: e.eventType,
        message: e.message,
      })),
      gateway: order.paymentGateway,
      provider: order.fulfillmentStatus,
    };
  }

  async listPins(userId: string, query: CustomerPinListQueryDto) {
    const skip = query.skip ?? 0;
    const take = Math.min(query.take ?? 20, 100);

    const orders = await this.prisma.order.findMany({
      where: {
        userId,
        deletedAt: null,
        paymentStatus: OrderPaymentStatus.PAID,
        fulfillmentStatus: FulfillmentStatus.COMPLETED,
        ...(query.from || query.to
          ? {
              createdAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
      },
      include: {
        orderItems: {
          include: {
            variant: { select: { name: true } },
            cardRecords: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    let all: Array<{
      orderId: string;
      orderCode: string;
      productName: string;
      cardId: string;
      serial: string;
      pinViewCount: number;
      createdAt: string;
      status: string;
    }> = [];

    for (const order of orders) {
      for (const item of order.orderItems) {
        for (const card of item.cardRecords) {
          all.push({
            orderId: order.id,
            orderCode: order.orderCode,
            productName: item.variant?.name ?? '',
            cardId: card.id,
            serial: this.cardEncryption.decrypt(card.encryptedSerial),
            pinViewCount: card.pinViewCount,
            createdAt: order.createdAt.toISOString(),
            status: card.status,
          });
        }
      }
    }

    if (query.q?.trim()) {
      const q = query.q.trim().toLowerCase();
      all = all.filter(
        (c) =>
          c.orderCode.toLowerCase().includes(q) ||
          c.serial.toLowerCase().includes(q) ||
          c.productName.toLowerCase().includes(q),
      );
    }

    if (query.product?.trim()) {
      const p = query.product.trim().toLowerCase();
      all = all.filter((c) => c.productName.toLowerCase().includes(p));
    }

    const total = all.length;
    const items = all.slice(skip, skip + take);

    return { items, total, skip, take };
  }

  async listNotifications(userId: string, query: CustomerNotificationQueryDto) {
    const skip = query.skip ?? 0;
    const take = Math.min(query.take ?? 30, 100);
    const rows = await this.notificationService.listUserNotifications(userId, 200);

    let filtered = rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      group: inferCustomerNotificationGroup(n.type, n.title),
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    }));

    if (query.group && query.group !== 'all') {
      filtered = filtered.filter((n) => n.group === query.group);
    }

    const total = filtered.length;
    return { items: filtered.slice(skip, skip + take), total, skip, take };
  }

  async deleteNotification(userId: string, notificationId: string) {
    return this.notificationService.deleteUserNotification(notificationId, userId);
  }

  async search(userId: string, q: string) {
    const term = q.trim();
    if (!term) {
      return { orders: [], pins: [], notifications: [] };
    }

    const [orders, notifications] = await Promise.all([
      this.listOrders(userId, { q: term, take: 10, skip: 0 }),
      this.listNotifications(userId, { take: 50, skip: 0, group: 'all' }),
    ]);

    const pins = await this.listPins(userId, { q: term, take: 10, skip: 0 });
    const notifFiltered = notifications.items.filter(
      (n) =>
        n.title.toLowerCase().includes(term.toLowerCase()) ||
        n.body.toLowerCase().includes(term.toLowerCase()),
    );

    return {
      orders: orders.items,
      pins: pins.items,
      notifications: notifFiltered.slice(0, 10),
    };
  }

  async resendOrderEmail(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId, deletedAt: null },
    });
    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }
    if (order.fulfillmentStatus !== FulfillmentStatus.COMPLETED) {
      throw new ForbiddenException('Đơn hàng chưa hoàn tất — chưa thể gửi lại email');
    }
    await this.notificationService.resendCardDeliveryEmail(orderId);
    return { ok: true, message: 'Đã gửi lại email PIN' };
  }

  async getProfile(userId: string) {
    return this.accountService.getProfile(userId);
  }

  async updateProfile(userId: string, dto: { fullName?: string; phone?: string }) {
    return this.accountService.updateProfile(userId, dto);
  }

  async changePassword(
    userId: string,
    dto: { oldPassword: string; newPassword: string; confirmPassword: string },
  ) {
    return this.accountService.changePassword(userId, dto);
  }

  async listSessions(userId: string) {
    const sessions = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
      },
    });
    return {
      items: sessions.map((s) => ({
        id: s.id,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        active: true,
      })),
    };
  }

  async revokeOtherSessions(userId: string, keepTokenHash?: string) {
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(keepTokenHash ? { NOT: { tokenHash: keepTokenHash } } : {}),
      },
      data: { revokedAt: new Date() },
    });
    return { ok: true, message: 'Đã đăng xuất các thiết bị khác' };
  }

  async closeSupportTicket(userId: string, ticketId: string) {
    const updated = await this.prisma.supportTicket.updateMany({
      where: { id: ticketId, customerId: userId, status: { not: SupportTicketStatus.RESOLVED } },
      data: { status: SupportTicketStatus.RESOLVED },
    });
    if (updated.count === 0) {
      throw new NotFoundException('Không tìm thấy phiếu hỗ trợ');
    }
    return { ok: true };
  }
}
