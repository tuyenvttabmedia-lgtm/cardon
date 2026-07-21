import { Injectable } from '@nestjs/common';
import {
  FinancialTransactionStatus,
  FinancialTransactionType,
  FulfillmentStatus,
  OrderChannel,
  OrderPaymentStatus,
  PaymentSettlementType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { ACTIVE_ORDER_WHERE } from '../entities/order.constants';

const ORDER_INCLUDE = {
  orderItems: {
    include: {
      variant: {
        select: { sku: true, name: true },
      },
    },
  },
} satisfies Prisma.OrderInclude;

const ORDER_INCLUDE_WITH_CARDS = {
  orderItems: {
    include: {
      variant: {
        select: { sku: true, name: true, type: true },
      },
      cardRecords: {
        select: {
          id: true,
          encryptedSerial: true,
          encryptedPin: true,
          pinViewCount: true,
          pinFirstViewedAt: true,
          viewCount: true,
          firstViewedAt: true,
        },
      },
    },
  },
  orderEvents: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      eventType: true,
      createdAt: true,
    },
  },
} satisfies Prisma.OrderInclude;

export interface CreateOrderRecordInput {
  orderCode: string;
  transactionId: string;
  userId?: string;
  guestEmail?: string;
  guestPhone?: string;
  isGuestOrder: boolean;
  invoiceRequired: boolean;
  invoiceMetadata: Prisma.InputJsonValue;
  customerNote?: string;
  clientTrace?: Prisma.InputJsonValue;
  totalAmount: Prisma.Decimal;
  faceValue: Prisma.Decimal;
  sellAmount: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  paymentMethodCode: string;
  methodDisplayName: string;
  paymentGateway: string;
  settlementType: PaymentSettlementType;
  paymentFeePercent: Prisma.Decimal;
  paymentFeeFixed: Prisma.Decimal;
  paymentFeeAmount: Prisma.Decimal;
  customerPaid: Prisma.Decimal;
  providerCost: Prisma.Decimal;
  profit: Prisma.Decimal;
  paymentExpiresAt: Date;
}

export interface CreateOrderItemRecordInput {
  orderId: string;
  variantId: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  discount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
}

@Injectable()
export class OrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.order.findFirst({
      where: { id, ...ACTIVE_ORDER_WHERE },
      include: ORDER_INCLUDE,
    });
  }

  findByIdForUser(id: string, userId: string) {
    return this.prisma.order.findFirst({
      where: { id, userId, ...ACTIVE_ORDER_WHERE },
      include: ORDER_INCLUDE,
    });
  }

  findByCodeForGuest(orderCode: string, guestEmail: string) {
    return this.prisma.order.findFirst({
      where: {
        ...ACTIVE_ORDER_WHERE,
        orderCode: { equals: orderCode.trim(), mode: 'insensitive' },
        OR: [
          { guestEmail: { equals: guestEmail.trim(), mode: 'insensitive' } },
          { user: { email: { equals: guestEmail.trim(), mode: 'insensitive' } } },
        ],
      },
      include: ORDER_INCLUDE,
    });
  }

  findByCodeForGuestWithCards(orderCode: string, guestEmail: string) {
    return this.prisma.order.findFirst({
      where: {
        ...ACTIVE_ORDER_WHERE,
        orderCode: { equals: orderCode.trim(), mode: 'insensitive' },
        OR: [
          { guestEmail: { equals: guestEmail.trim(), mode: 'insensitive' } },
          { user: { email: { equals: guestEmail.trim(), mode: 'insensitive' } } },
        ],
      },
      include: ORDER_INCLUDE_WITH_CARDS,
    });
  }

  findByIdForUserWithCards(id: string, userId: string) {
    return this.prisma.order.findFirst({
      where: { id, userId, ...ACTIVE_ORDER_WHERE },
      include: ORDER_INCLUDE_WITH_CARDS,
    });
  }

  findByIdForUserWithDelivery(id: string, userId: string) {
    return this.findByIdForUserWithCards(id, userId);
  }

  findByCodeForGuestWithDelivery(orderCode: string, guestEmail: string) {
    return this.findByCodeForGuestWithCards(orderCode, guestEmail);
  }

  findByIdForGuestWithDelivery(orderId: string, guestEmail: string) {
    return this.prisma.order.findFirst({
      where: {
        id: orderId,
        ...ACTIVE_ORDER_WHERE,
        OR: [
          { guestEmail: { equals: guestEmail.trim(), mode: 'insensitive' } },
          { user: { email: { equals: guestEmail.trim(), mode: 'insensitive' } } },
        ],
      },
      include: ORDER_INCLUDE_WITH_CARDS,
    });
  }

  incrementCardPinView(cardId: string, isFirstView: boolean, viewedAt: Date) {
    return this.prisma.cardRecord.update({
      where: { id: cardId },
      data: {
        pinViewCount: { increment: 1 },
        viewCount: { increment: 1 },
        ...(isFirstView
          ? {
              pinFirstViewedAt: viewedAt,
              firstViewedAt: viewedAt,
            }
          : {}),
      },
    });
  }

  findManyByUserId(userId: string) {
    return this.prisma.order.findMany({
      where: { userId, ...ACTIVE_ORDER_WHERE },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  findManyAdmin(filters: {
    paymentStatus?: OrderPaymentStatus;
    fulfillmentStatus?: FulfillmentStatus;
    dateFrom?: Date;
    dateTo?: Date;
    skip?: number;
    take?: number;
  }) {
    const where: Prisma.OrderWhereInput = { ...ACTIVE_ORDER_WHERE };

    if (filters.paymentStatus) {
      where.paymentStatus = filters.paymentStatus;
    }
    if (filters.fulfillmentStatus) {
      where.fulfillmentStatus = filters.fulfillmentStatus;
    }
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) {
        where.createdAt.gte = filters.dateFrom;
      }
      if (filters.dateTo) {
        where.createdAt.lte = filters.dateTo;
      }
    }

    return this.prisma.order.findMany({
      where,
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: filters.skip,
      take: filters.take ?? 50,
    });
  }

  findWaitingPaymentExpired(now: Date) {
    return this.prisma.order.findMany({
      where: {
        paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
        paymentExpiresAt: { lt: now },
        ...ACTIVE_ORDER_WHERE,
      },
      select: { id: true, orderCode: true },
    });
  }

  createWithTransaction(
    tx: Prisma.TransactionClient,
    input: CreateOrderRecordInput,
  ) {
    return tx.order.create({
      data: {
        orderCode: input.orderCode,
        transactionId: input.transactionId,
        userId: input.userId,
        guestEmail: input.guestEmail,
        guestPhone: input.guestPhone,
        isGuestOrder: input.isGuestOrder,
        channel: OrderChannel.B2C,
        invoiceRequired: input.invoiceRequired,
        invoiceMetadata: input.invoiceMetadata,
        customerNote: input.customerNote,
        clientTrace: input.clientTrace ?? {},
        totalAmount: input.totalAmount,
        faceValue: input.faceValue,
        sellAmount: input.sellAmount,
        discountAmount: input.discountAmount,
        paymentMethodCode: input.paymentMethodCode,
        methodDisplayName: input.methodDisplayName,
        paymentGateway: input.paymentGateway,
        settlementType: input.settlementType,
        paymentFeePercent: input.paymentFeePercent,
        paymentFeeFixed: input.paymentFeeFixed,
        paymentFeeAmount: input.paymentFeeAmount,
        customerPaid: input.customerPaid,
        providerCost: input.providerCost,
        profit: input.profit,
        paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
        fulfillmentStatus: FulfillmentStatus.PENDING,
        paymentExpiresAt: input.paymentExpiresAt,
      },
      include: ORDER_INCLUDE,
    });
  }

  createFinancialTransaction(
    tx: Prisma.TransactionClient,
    input: {
      transactionId: string;
      amount: Prisma.Decimal;
    },
  ) {
    return tx.financialTransaction.create({
      data: {
        transactionId: input.transactionId,
        type: FinancialTransactionType.B2C_CHECKOUT,
        amount: input.amount,
        status: FinancialTransactionStatus.PENDING,
      },
    });
  }

  createOrderItem(tx: Prisma.TransactionClient, input: CreateOrderItemRecordInput) {
    return tx.orderItem.create({
      data: {
        orderId: input.orderId,
        variantId: input.variantId,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        discount: input.discount,
        totalAmount: input.totalAmount,
      },
    });
  }

  updatePaymentStatus(
    id: string,
    paymentStatus: OrderPaymentStatus,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.order.update({
      where: { id },
      data: { paymentStatus },
    });
  }

  updateCustomerNote(id: string, customerNote: string | null) {
    return this.prisma.order.update({
      where: { id },
      data: { customerNote },
      include: ORDER_INCLUDE,
    });
  }

  linkActivePayment(id: string, paymentId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.order.update({
      where: { id },
      data: { paymentId },
    });
  }

  findByIdWithPaymentFields(id: string) {
    return this.prisma.order.findFirst({
      where: { id, ...ACTIVE_ORDER_WHERE },
      select: {
        id: true,
        userId: true,
        isGuestOrder: true,
        paymentStatus: true,
        paymentExpiresAt: true,
        paymentId: true,
        totalAmount: true,
      },
    });
  }
}
