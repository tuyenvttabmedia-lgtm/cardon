import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { FulfillmentStatus, OrderPaymentStatus, ProductVariantType, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../../database/prisma.service';
import { CardEncryptionService } from '../../provider/services/card-encryption.service';
import { resolveCustomerOrderStatus } from '../../order/entities/customer-order-status.util';
import { BCRYPT_ROUNDS } from '../auth.constants';
import { ChangePasswordDto, UpdateProfileDto } from '../../admin/dto/admin-operation.dto';
import { AuthUserSummary } from '../interfaces/auth-result.interface';

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cardEncryption: CardEncryptionService,
  ) {}

  async getProfile(userId: string): Promise<AuthUserSummary & { phone: string | null; createdAt: string }> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, role: UserRole.CUSTOMER },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      emailVerified: user.emailVerifiedAt !== null,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: dto.fullName?.trim(),
        phone: dto.phone?.trim(),
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        emailVerifiedAt: true,
        createdAt: true,
      },
    });
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      emailVerified: user.emailVerifiedAt !== null,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Password confirmation does not match');
    }

    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const valid = await bcrypt.compare(dto.oldPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid current password');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { message: 'Password changed successfully' };
  }

  listOrders(
    userId: string,
    tab: 'all' | 'processing' | 'completed' = 'all',
    type?: 'CARD' | 'TOPUP' | 'DATA',
    skip = 0,
    take = 15,
  ) {
    const where: {
      userId: string;
      deletedAt: null;
      OR?: Array<Record<string, unknown>>;
      fulfillmentStatus?: FulfillmentStatus;
      paymentStatus?: OrderPaymentStatus;
    } = { userId, deletedAt: null };

    if (tab === 'processing') {
      where.OR = [
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
      ];
    } else if (tab === 'completed') {
      where.fulfillmentStatus = FulfillmentStatus.COMPLETED;
    }

    const resolvedTake = Math.min(Math.max(take, 1), 100);
    const resolvedSkip = Math.max(skip, 0);
    const fullWhere = {
      ...where,
      ...(type
        ? {
            orderItems: {
              some: { variant: { type } },
            },
          }
        : {}),
    };

    return Promise.all([
      this.prisma.order.findMany({
        where: fullWhere,
        select: {
          id: true,
          orderCode: true,
          totalAmount: true,
          paymentStatus: true,
          fulfillmentStatus: true,
          createdAt: true,
          orderItems: {
            select: {
              quantity: true,
              variant: {
                select: {
                  name: true,
                  type: true,
                  faceValue: true,
                  product: { select: { name: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: resolvedSkip,
        take: resolvedTake,
      }),
      this.prisma.order.count({ where: fullWhere }),
    ]).then(([rows, total]) => ({
      items: rows.map((order) => ({
        id: order.id,
        orderCode: order.orderCode,
        totalAmount: order.totalAmount,
        paymentStatus: order.paymentStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        customerStatus: resolveCustomerOrderStatus(
          order.paymentStatus,
          order.fulfillmentStatus,
        ),
        createdAt: order.createdAt,
        items: order.orderItems.map((item) => ({
          productName: item.variant?.product?.name ?? item.variant?.name ?? 'Sản phẩm',
          variantName: item.variant?.name ?? '',
          variantType: item.variant?.type ?? 'CARD',
          faceValue: item.variant?.faceValue?.toString() ?? null,
          quantity: item.quantity,
        })),
      })),
      total,
      skip: resolvedSkip,
      take: resolvedTake,
    }));
  }

  async listPurchasedCards(userId: string, skip = 0, take = 15) {
    const resolvedTake = Math.min(Math.max(take, 1), 100);
    const resolvedSkip = Math.max(skip, 0);
    const where = {
      orderItem: {
        order: {
          userId,
          deletedAt: null,
          paymentStatus: OrderPaymentStatus.PAID,
          fulfillmentStatus: FulfillmentStatus.COMPLETED,
        },
      },
    };

    const [rows, total] = await Promise.all([
      this.prisma.cardRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: resolvedSkip,
        take: resolvedTake,
        include: {
          orderItem: {
            include: {
              variant: { select: { name: true } },
              order: { select: { id: true, orderCode: true } },
            },
          },
        },
      }),
      this.prisma.cardRecord.count({ where }),
    ]);

    return {
      items: rows.map((card) => ({
        orderId: card.orderItem.order.id,
        orderCode: card.orderItem.order.orderCode,
        productName: card.orderItem.variant?.name ?? '',
        cardId: card.id,
        serial: this.cardEncryption.decrypt(card.encryptedSerial),
        pinViewCount: card.pinViewCount,
      })),
      total,
      skip: resolvedSkip,
      take: resolvedTake,
    };
  }

  listTopupHistory(userId: string, skip = 0, take = 15) {
    const resolvedTake = Math.min(Math.max(take, 1), 100);
    const resolvedSkip = Math.max(skip, 0);
    const where = { order: { userId, deletedAt: null } };

    return Promise.all([
      this.prisma.topupTransaction.findMany({
        where,
        select: {
          phoneNumber: true,
          telco: true,
          amount: true,
          status: true,
          createdAt: true,
          order: { select: { orderCode: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: resolvedSkip,
        take: resolvedTake,
      }),
      this.prisma.topupTransaction.count({ where }),
    ]).then(([rows, total]) => ({
      items: rows.map((row) => ({
        phone: row.phoneNumber,
        network: row.telco,
        amount: row.amount.toString(),
        status: row.status,
        orderCode: row.order.orderCode,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      skip: resolvedSkip,
      take: resolvedTake,
    }));
  }

  listDataHistory(userId: string) {
    return this.prisma.order.findMany({
      where: {
        userId,
        deletedAt: null,
        orderItems: { some: { variant: { type: ProductVariantType.DATA } } },
      },
      select: {
        orderCode: true,
        paymentStatus: true,
        fulfillmentStatus: true,
        totalAmount: true,
        createdAt: true,
        orderItems: {
          where: { variant: { type: ProductVariantType.DATA } },
          select: {
            quantity: true,
            totalAmount: true,
            variant: { select: { name: true, faceValue: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }).then((rows) =>
      rows.flatMap((order) =>
        order.orderItems.map((item) => ({
          orderCode: order.orderCode,
          productName: item.variant?.name ?? 'Gói Data',
          amount: item.totalAmount.toString(),
          status: order.fulfillmentStatus,
          createdAt: order.createdAt.toISOString(),
        })),
      ),
    );
  }
}
