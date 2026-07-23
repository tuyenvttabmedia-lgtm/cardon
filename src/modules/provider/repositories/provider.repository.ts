import { Injectable } from '@nestjs/common';
import {
  FulfillmentStatus,
  NotificationRecipientRole,
  NotificationRecipientType,
  OrderItemStatus,
  CardRecordStatus,
  Prisma,
  Provider,
  ProviderTransactionAction,
  ProviderTransactionStatus,
  ProviderTransactionType,
  ProviderStatus,
  TopupTransactionStatus,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { resolveAdminPagination } from '../../admin/utils/admin-pagination.util';
import {
  ProviderTransactionMetadata,
  RECOVERABLE_PROVIDER_STATUSES,
} from '../entities/provider-transaction.metadata';

@Injectable()
export class ProviderRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProviderById(id: string) {
    return this.prisma.provider.findFirst({
      where: { id, deletedAt: null },
    });
  }

  findProviderByCode(code: string) {
    return this.prisma.provider.findFirst({
      where: { code: code.toUpperCase(), deletedAt: null },
    });
  }

  listActiveProviders() {
    return this.prisma.provider.findMany({
      where: { deletedAt: null, status: ProviderStatus.ACTIVE },
      orderBy: { code: 'asc' },
    });
  }

  listAllProviders() {
    return this.prisma.provider.findMany({
      where: { deletedAt: null },
      orderBy: { code: 'asc' },
    });
  }

  updateBalance(providerId: string, balance: Prisma.Decimal, syncedAt: Date) {
    return this.prisma.provider.update({
      where: { id: providerId },
      data: {
        balance,
        lastBalanceSyncedAt: syncedAt,
      },
    });
  }

  createProviderLog(params: {
    providerId: string;
    orderId?: string;
    requestId?: string;
    action?: ProviderTransactionAction;
    status?: ProviderTransactionStatus;
    requestPayload?: Prisma.InputJsonValue;
    responsePayload?: Prisma.InputJsonValue;
    errorMessage?: string;
  }) {
    return this.prisma.providerLog.create({
      data: {
        providerId: params.providerId,
        orderId: params.orderId,
        requestId: params.requestId,
        action: params.action,
        status: params.status,
        requestPayload: params.requestPayload ?? {},
        responsePayload: params.responsePayload,
        errorMessage: params.errorMessage,
      },
    });
  }

  createNotification(params: {
    type: string;
    title: string;
    body: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return this.prisma.notification.create({
      data: {
        recipientType: NotificationRecipientType.ADMIN_ROLE,
        recipientRole: NotificationRecipientRole.ADMIN,
        type: params.type,
        title: params.title,
        body: params.body,
        metadata: params.metadata ?? {},
      },
    });
  }
}

export type FulfillmentOrder = Prisma.OrderGetPayload<{
  include: {
    orderItems: {
      include: {
        variant: { select: { id: true; type: true; sku: true; faceValue: true; sellPrice: true } };
      };
    };
  };
}>;

@Injectable()
export class ProviderOrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  findOrderForFulfillment(orderId: string): Promise<FulfillmentOrder | null> {
    return this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      include: {
        orderItems: {
          include: {
            variant: { select: { id: true, type: true, sku: true, faceValue: true, sellPrice: true } },
          },
        },
      },
    });
  }

  claimFulfillmentProcessing(orderId: string, tx: Prisma.TransactionClient) {
    return tx.order.updateMany({
      where: {
        id: orderId,
        fulfillmentStatus: {
          in: [
            FulfillmentStatus.PENDING,
            FulfillmentStatus.WAITING_ADMIN_RETRY,
            FulfillmentStatus.NEED_MANUAL_REVIEW,
          ],
        },
        deletedAt: null,
      },
      data: { fulfillmentStatus: FulfillmentStatus.PROCESSING },
    });
  }

  updateFulfillmentStatus(
    orderId: string,
    status: FulfillmentStatus,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.order.update({
      where: { id: orderId },
      data: { fulfillmentStatus: status },
    });
  }

  updateOrderItemStatus(
    orderItemId: string,
    status: OrderItemStatus,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.orderItem.update({
      where: { id: orderItemId },
      data: { status },
    });
  }
}

export type ProviderTransactionRecord = Prisma.ProviderTransactionGetPayload<object>;

@Injectable()
export class ProviderTransactionRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    data: {
      orderId: string;
      orderItemId?: string;
      providerId: string;
      requestId: string;
      attempt: number;
      action: ProviderTransactionAction;
      type?: ProviderTransactionType;
      status?: ProviderTransactionStatus;
      providerTransactionDate?: string;
      providerMetadata?: ProviderTransactionMetadata;
      faceValue?: Prisma.Decimal;
      providerCost?: Prisma.Decimal;
      requestPayload: Prisma.InputJsonValue;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.providerTransaction.create({
      data: {
        orderId: data.orderId,
        orderItemId: data.orderItemId,
        providerId: data.providerId,
        requestId: data.requestId,
        attempt: data.attempt,
        action: data.action,
        type: data.type,
        status: data.status ?? ProviderTransactionStatus.PROCESSING,
        providerTransactionDate: data.providerTransactionDate,
        providerMetadata: (data.providerMetadata ?? {}) as Prisma.InputJsonValue,
        faceValue: data.faceValue,
        providerCost: data.providerCost,
        requestPayload: data.requestPayload,
      },
    });
  }

  updateResult(
    id: string,
    data: {
      status: ProviderTransactionStatus;
      providerTransactionId?: string;
      providerReference?: string;
      responsePayload?: Prisma.InputJsonValue;
      errorCode?: string;
      errorMessage?: string;
      completedAt?: Date;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.providerTransaction.update({
      where: { id },
      data: {
        status: data.status,
        providerTransactionId: data.providerTransactionId,
        providerReference: data.providerReference,
        responsePayload: data.responsePayload,
        errorCode: data.errorCode,
        errorMessage: data.errorMessage,
        completedAt: data.completedAt,
      },
    });
  }

  findMaxAttempt(orderId: string, providerId: string) {
    return this.prisma.providerTransaction.aggregate({
      where: { orderId, providerId, deletedAt: null },
      _max: { attempt: true },
    });
  }

  findLatestSuccess(orderId: string, providerId: string) {
    return this.prisma.providerTransaction.findFirst({
      where: {
        orderId,
        providerId,
        status: ProviderTransactionStatus.SUCCESS,
        deletedAt: null,
      },
      orderBy: { attempt: 'desc' },
    });
  }

  findLatestRecoverable(
    orderId: string,
    providerId: string,
    action?: ProviderTransactionAction,
  ) {
    return this.prisma.providerTransaction.findFirst({
      where: {
        orderId,
        providerId,
        ...(action ? { action } : {}),
        status: { in: [...RECOVERABLE_PROVIDER_STATUSES] },
        deletedAt: null,
      },
      orderBy: { attempt: 'desc' },
    });
  }

  /** Oldest-first so recovery can discover an earlier SUCCESS before a later TIMEOUT. */
  findRecoverableAttempts(
    orderId: string,
    providerId: string,
    action?: ProviderTransactionAction,
  ) {
    return this.prisma.providerTransaction.findMany({
      where: {
        orderId,
        providerId,
        ...(action ? { action } : {}),
        status: { in: [...RECOVERABLE_PROVIDER_STATUSES] },
        deletedAt: null,
      },
      orderBy: { attempt: 'asc' },
    });
  }

  findByRequestId(requestId: string) {
    return this.prisma.providerTransaction.findFirst({
      where: { requestId, deletedAt: null },
    });
  }

  listByOrderId(orderId: string) {
    return this.prisma.providerTransaction.findMany({
      where: { orderId, deletedAt: null },
      orderBy: { attempt: 'asc' },
    });
  }

  findManyByProviderAdmin(
    providerId: string,
    pagination: { skip?: number; take?: number },
  ) {
    const resolved = resolveAdminPagination(pagination.skip, pagination.take);

    return this.prisma.providerTransaction.findMany({
      where: { providerId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      skip: resolved.skip,
      take: resolved.take,
    });
  }

  countByProviderAdmin(providerId: string) {
    return this.prisma.providerTransaction.count({
      where: { providerId, deletedAt: null },
    });
  }
}

@Injectable()
export class CardRecordRepository {
  constructor(private readonly prisma: PrismaService) {}

  createMany(
    records: Array<{
      orderItemId: string;
      encryptedSerial: string;
      encryptedPin: string;
      providerResponse: Prisma.InputJsonValue;
    }>,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.cardRecord.createMany({
      data: records.map((r) => ({
        orderItemId: r.orderItemId,
        encryptedSerial: r.encryptedSerial,
        encryptedPin: r.encryptedPin,
        providerResponse: r.providerResponse,
        status: CardRecordStatus.DELIVERED,
      })),
    });
  }

  countByOrderItemId(orderItemId: string) {
    return this.prisma.cardRecord.count({
      where: { orderItemId },
    });
  }
}

@Injectable()
export class TopupTransactionRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByOrderItemId(orderItemId: string) {
    return this.prisma.topupTransaction.findFirst({
      where: { orderItemId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async upsertSuccess(
    params: {
      orderId: string;
      orderItemId: string;
      phoneNumber: string;
      telco: string;
      amount: number;
      providerReference: string;
      resultMessage: string | null;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const data = {
      orderId: params.orderId,
      orderItemId: params.orderItemId,
      phoneNumber: params.phoneNumber,
      telco: params.telco,
      amount: params.amount,
      providerReference: params.providerReference,
      status: TopupTransactionStatus.SUCCESS,
      resultMessage: params.resultMessage,
    };
    const existing = await client.topupTransaction.findFirst({
      where: { orderItemId: params.orderItemId },
    });
    if (existing) {
      return client.topupTransaction.update({ where: { id: existing.id }, data });
    }
    return client.topupTransaction.create({ data });
  }

  async upsertFailed(
    params: {
      orderId: string;
      orderItemId: string;
      phoneNumber: string;
      telco: string;
      amount: number;
      providerReference: string;
      resultMessage: string;
    },
    status: TopupTransactionStatus,
  ) {
    const data = {
      orderId: params.orderId,
      orderItemId: params.orderItemId,
      phoneNumber: params.phoneNumber,
      telco: params.telco,
      amount: params.amount,
      providerReference: params.providerReference,
      status,
      resultMessage: params.resultMessage,
    };
    return this.prisma.topupTransaction
      .findFirst({ where: { orderItemId: params.orderItemId } })
      .then((existing) =>
        existing
          ? this.prisma.topupTransaction.update({ where: { id: existing.id }, data })
          : this.prisma.topupTransaction.create({ data }),
      );
  }
}
