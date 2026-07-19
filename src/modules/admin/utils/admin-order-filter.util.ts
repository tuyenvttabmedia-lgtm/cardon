import {
  FulfillmentStatus,
  OrderPaymentStatus,
  Prisma,
  ProductVariantType,
} from '@prisma/client';
import { AdminOrderQueryDto } from '../dto/admin.dto';

export type AdminDeliveryFilter =
  | 'PROCESSING'
  | 'DELIVERED'
  | 'FAILED'
  | 'NEED_SUPPORT';

export type AdminPaymentFilter = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function mapPaymentFilter(status?: AdminPaymentFilter): OrderPaymentStatus | undefined {
  if (!status) return undefined;
  if (status === 'PENDING') return OrderPaymentStatus.WAITING_PAYMENT;
  return status as OrderPaymentStatus;
}

export function mapDeliveryFilter(
  status?: AdminDeliveryFilter,
): FulfillmentStatus | FulfillmentStatus[] | undefined {
  if (!status) return undefined;
  switch (status) {
    case 'PROCESSING':
      return FulfillmentStatus.PROCESSING;
    case 'DELIVERED':
      return FulfillmentStatus.COMPLETED;
    case 'FAILED':
      return FulfillmentStatus.FAILED;
    case 'NEED_SUPPORT':
      return [FulfillmentStatus.NEED_MANUAL_REVIEW, FulfillmentStatus.WAITING_ADMIN_RETRY];
    default:
      return undefined;
  }
}

export function buildAdminOrderWhere(query: AdminOrderQueryDto): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};

  const paymentStatus = query.paymentStatus ?? mapPaymentFilter(query.paymentFilter);
  if (paymentStatus) {
    where.paymentStatus = paymentStatus;
  }

  const deliveryFilter = mapDeliveryFilter(query.deliveryStatus);
  if (deliveryFilter) {
    where.fulfillmentStatus = Array.isArray(deliveryFilter)
      ? { in: deliveryFilter }
      : deliveryFilter;
  } else if (query.fulfillmentStatus ?? query.status) {
    where.fulfillmentStatus = query.fulfillmentStatus ?? query.status;
  }

  if (query.dateFrom || query.dateTo || query.fromDate || query.toDate) {
    where.createdAt = {};
    const from = query.dateFrom ?? query.fromDate;
    const to = query.dateTo ?? query.toDate;
    if (from) {
      where.createdAt.gte = new Date(from);
    }
    if (to) {
      where.createdAt.lte = endOfDay(new Date(to));
    }
  }

  const search = query.q?.trim() || query.customer?.trim();
  if (search) {
    where.OR = [
      { orderCode: { contains: search, mode: 'insensitive' } },
      { guestEmail: { contains: search, mode: 'insensitive' } },
      { guestPhone: { contains: search, mode: 'insensitive' } },
      { user: { is: { email: { contains: search, mode: 'insensitive' } } } },
      { user: { is: { phone: { contains: search, mode: 'insensitive' } } } },
      {
        payments: {
          some: {
            deletedAt: null,
            OR: [
              { paymentReference: { contains: search, mode: 'insensitive' } },
              { gatewayTransactionId: { contains: search, mode: 'insensitive' } },
              { bankTransactionId: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
      },
      {
        providerTransactions: {
          some: {
            deletedAt: null,
            OR: [
              { providerTransactionId: { contains: search, mode: 'insensitive' } },
              { providerReference: { contains: search, mode: 'insensitive' } },
              { requestId: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
      },
    ];
  }

  if (query.productType) {
    where.orderItems = {
      some: {
        variant: { type: query.productType as ProductVariantType },
      },
    };
  }

  if (query.providerId) {
    where.providerTransactions = {
      some: {
        deletedAt: null,
        providerId: query.providerId,
      },
    };
  }

  return where;
}
