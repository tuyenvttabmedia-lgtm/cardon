import {
  AuditLog,
  CardRecord,
  Order,
  OrderItem,
  Payment,
  ProductVariant,
  Provider,
  ProviderLog,
  ProviderTransaction,
  TopupTransaction,
  User,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { sanitizeGatewayPayload } from '../../payment/entities/gateway-payload-safety';
import { mapAdminProviderTransaction } from './admin-provider-transaction.mapper';
import { decimalToString, mapOrder, mapOrderItem } from '../../order/entities/order.mapper';

import { maskPinDisplay } from './card-pin.util';
import {
  AdminDeliveryView,
  itemFaceValueFromOrderItem,
  mapAdminOrderDelivery,
} from './admin-order-delivery.mapper';
import { lineSellPrice, resolveOrderPricingSnapshot } from './admin-order-pricing.util';

function extractGatewayTrace(gateway: string, response: unknown) {
  const record =
    response && typeof response === 'object' && !Array.isArray(response)
      ? (response as Record<string, unknown>)
      : {};

  return {
    gatewayTransactionId:
      (record.gatewayTransactionId as string | undefined) ??
      (record.transaction_id as string | undefined) ??
      (record.transId as string | undefined) ??
      null,
    bankTransactionId:
      (record.bankTransactionId as string | undefined) ??
      (record.bank_trans_id as string | undefined) ??
      null,
    bankInfo:
      (record.bankCode as string | undefined) ??
      (record.bank_code as string | undefined) ??
      (record.bankAccount as string | undefined) ??
      null,
    webhookStatus: (record.webhookStatus as string | undefined) ?? null,
    webhookReceivedAt:
      (record.webhookReceivedAt as string | undefined) ??
      (record.lateWebhookAt as string | undefined) ??
      null,
    rawResponse: sanitizeGatewayPayload(record),
    gateway,
  };
}

export interface AdminOrderDetailView {
  overview: {
    orderCode: string;
    customer: {
      userId: string | null;
      email: string | null;
      phone: string | null;
      username: string | null;
      fullName: string | null;
      guestEmail: string | null;
      guestPhone: string | null;
    };
    createdAt: string;
    products: Array<{
      sku: string;
      name: string;
      type: string;
      quantity: number;
      faceValue: string;
      sellPrice: string;
      unitPrice: string;
      totalAmount: string;
      deliveryStatus: string;
    }>;
    totalAmount: string;
    paymentStatus: string;
    fulfillmentStatus: string;
    pricing: {
      faceValue: string;
      sellAmount: string;
      discountAmount: string;
      gatewayFee: string;
      gatewayCode: string | null;
      methodCode: string | null;
      methodDisplayName: string | null;
      settlementType: string | null;
      paymentMethodCode: string | null;
      paymentGateway: string | null;
      paymentFeeAmount: string;
      customerPaid: string;
      providerCost: string;
      profit: string;
    };
  };
  delivery: AdminDeliveryView;
  paymentTrace: Array<{
    id: string;
    paymentReference: string;
    gateway: string;
    amount: string;
    status: string;
    paidAt: string | null;
    createdAt: string;
    gatewayTransactionId: string | null;
    bankTransactionId: string | null;
    bankInfo: string | null;
    webhookStatus: string | null;
    webhookReceivedAt: string | null;
    gatewayRawResponse: unknown;
  }>;
  providerTrace: Array<ReturnType<typeof mapAdminProviderTransaction> & {
    providerCode?: string;
    providerName?: string;
    cost: string | null;
    retryHistory: Array<{
      id: string;
      attempt: number;
      status: string;
      createdAt: string;
      errorMessage: string | null;
    }>;
  }>;
  cardDelivery: {
    cardCount: number;
    emailDeliveryStatus: 'SENT' | 'PENDING' | 'NOT_APPLICABLE';
    cards: Array<{
      id: string;
      productName: string;
      faceValue: string;
      serial: string;
      pinMasked: string;
      hasPin: boolean;
      pinViewed: boolean;
      status: string;
    }>;
  };
  pinRevealHistory: Array<{
    id: string;
    cardId: string;
    viewedBy: string;
    viewedByEmail: string;
    viewedAt: string;
  }>;
  topupDelivery: {
    items: Array<{
      id: string;
      phoneNumber: string;
      telco: string;
      amount: string;
      status: string;
      providerReference: string | null;
      resultMessage: string | null;
      createdAt: string;
    }>;
  };
  auditTimeline: Array<{
    id: string;
    action: string;
    targetType: string;
    actorEmail: string | null;
    actorRole: string | null;
    metadata: unknown;
    createdAt: string;
  }>;
  fulfillmentTimeline: Array<{
    id: string;
    eventType: string;
    message: string;
    metadata: unknown;
    createdAt: string;
  }>;
  clientTrace?: {
    customerId: string | null;
    customerEmail: string | null;
    phone: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    deviceInfo: unknown;
    capturedAt: string | null;
  };
  order: ReturnType<typeof mapOrder>;
}

type OrderDetailRow = Order & {
  orderItems: (OrderItem & { variant?: Pick<ProductVariant, 'sku' | 'name' | 'type'> | null; cardRecords: CardRecord[] })[];
  user: Pick<User, 'id' | 'email' | 'phone' | 'username' | 'fullName'> | null;
  payments: Payment[];
  providerTransactions: (ProviderTransaction & { provider?: Pick<Provider, 'code' | 'name'> })[];
  providerLogs: ProviderLog[];
  topupTransactions: TopupTransaction[];
  orderEvents?: Array<{
    id: string;
    eventType: string;
    message: string;
    metadata: unknown;
    createdAt: Date;
  }>;
};

export function mapAdminOrderDetail(params: {
  order: OrderDetailRow;
  auditLogs: (AuditLog & { admin: Pick<User, 'email' | 'role'> | null })[];
  pinAccessLogs?: Array<{
    id: string;
    cardId: string;
    createdAt: Date;
    admin: { id: string; email: string; fullName: string | null };
  }>;
  canViewPin?: boolean;
  decryptSerial: (encrypted: string) => string;
  decryptPin: (encrypted: string) => string;
}): AdminOrderDetailView {
  const {
    order,
    auditLogs,
    pinAccessLogs = [],
    canViewPin = false,
    decryptSerial,
    decryptPin,
  } = params;
  const base = mapOrder(order);

  const customerEmail = order.user?.email ?? order.guestEmail;
  const customerPhone = order.user?.phone ?? order.guestPhone;

  const products = order.orderItems.map((item) => ({
    sku: item.variant?.sku ?? '',
    name: item.variant?.name ?? '',
    type: item.variant?.type ?? 'CARD',
    quantity: item.quantity,
    faceValue: itemFaceValueFromOrderItem(item),
    sellPrice: lineSellPrice(item),
    unitPrice: decimalToString(item.unitPrice),
    totalAmount: decimalToString(item.totalAmount),
    deliveryStatus: item.status,
  }));

  const pricingSnapshot = resolveOrderPricingSnapshot(order);
  const delivery = mapAdminOrderDelivery({
    order,
    canViewPin,
    decryptSerial,
    decryptPin,
  });

  const paymentTrace = order.payments.map((payment) => {
    const trace = extractGatewayTrace(payment.gateway, payment.gatewayResponse);
    return {
      id: payment.id,
      paymentReference: payment.paymentReference,
      gateway: payment.gateway,
      amount: decimalToString(payment.amount),
      status: payment.status,
      paidAt: payment.paidAt?.toISOString() ?? null,
      createdAt: payment.createdAt.toISOString(),
      gatewayTransactionId: trace.gatewayTransactionId,
      bankTransactionId: trace.bankTransactionId,
      bankInfo: trace.bankInfo,
      webhookStatus: trace.webhookStatus,
      webhookReceivedAt: trace.webhookReceivedAt,
      gatewayRawResponse: trace.rawResponse,
    };
  });

  const logsByRequest = new Map<string, ProviderLog[]>();
  for (const log of order.providerLogs) {
    if (!log.requestId) continue;
    const list = logsByRequest.get(log.requestId) ?? [];
    list.push(log);
    logsByRequest.set(log.requestId, list);
  }

  const providerTrace = order.providerTransactions.map((tx) => {
    const mapped = mapAdminProviderTransaction(tx);
    const metadata =
      tx.providerMetadata && typeof tx.providerMetadata === 'object'
        ? (tx.providerMetadata as Record<string, unknown>)
        : {};
    const costValue = metadata.cost ?? metadata.providerCost;
    const cost =
      costValue instanceof Decimal || typeof costValue === 'number' || typeof costValue === 'string'
        ? decimalToString(costValue)
        : null;

    const retryHistory = (logsByRequest.get(tx.requestId) ?? []).map((log) => ({
      id: log.id,
      attempt: tx.attempt,
      status: log.status ?? 'UNKNOWN',
      createdAt: log.createdAt.toISOString(),
      errorMessage: log.errorMessage,
    }));

    return {
      ...mapped,
      providerCode: tx.provider?.code,
      providerName: tx.provider?.name,
      cost,
      retryHistory,
    };
  });

  const adminViewedCardIds = new Set(pinAccessLogs.map((log) => log.cardId));
  const cards: AdminOrderDetailView['cardDelivery']['cards'] = delivery.items
    .filter((item) => item.cardId)
    .map((item) => ({
      id: item.cardId!,
      productName: item.productName,
      faceValue: item.faceValue,
      serial: item.serial ?? '',
      pinMasked: item.pin ?? item.pinMasked ?? maskPinDisplay(),
      hasPin: Boolean(item.pin ?? item.pinMasked),
      pinViewed: adminViewedCardIds.has(item.cardId!),
      status: item.status ?? 'PENDING',
    }));

  const emailDeliveryStatus =
    order.fulfillmentStatus === 'COMPLETED' && order.paymentStatus === 'PAID'
      ? 'SENT'
      : order.paymentStatus === 'PAID'
        ? 'PENDING'
        : 'NOT_APPLICABLE';

  const traceRaw =
    order.clientTrace && typeof order.clientTrace === 'object' && !Array.isArray(order.clientTrace)
      ? (order.clientTrace as Record<string, unknown>)
      : {};

  return {
    overview: {
      orderCode: order.orderCode,
      customer: {
        userId: order.userId,
        email: customerEmail,
        phone: customerPhone,
        username: order.user?.username ?? null,
        fullName: order.user?.fullName ?? null,
        guestEmail: order.guestEmail,
        guestPhone: order.guestPhone,
      },
      createdAt: order.createdAt.toISOString(),
      products,
      totalAmount: decimalToString(order.totalAmount),
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      pricing: {
        ...pricingSnapshot,
        gatewayCode: order.paymentGateway,
        methodCode: order.paymentMethodCode,
        methodDisplayName: order.methodDisplayName,
        settlementType: order.settlementType,
        paymentMethodCode: order.paymentMethodCode,
        paymentGateway: order.paymentGateway,
      },
    },
    delivery,
    paymentTrace,
    providerTrace,
    cardDelivery: {
      cardCount: cards.length,
      emailDeliveryStatus,
      cards,
    },
    topupDelivery: {
      items: order.topupTransactions.map((topup) => ({
        id: topup.id,
        phoneNumber: topup.phoneNumber,
        telco: topup.telco,
        amount: decimalToString(topup.amount),
        status: topup.status,
        providerReference: topup.providerReference,
        resultMessage: topup.resultMessage,
        createdAt: topup.createdAt.toISOString(),
      })),
    },
    auditTimeline: auditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      targetType: log.targetType,
      actorEmail: log.admin?.email ?? null,
      actorRole: log.admin?.role ?? null,
      metadata: log.metadata,
      createdAt: log.createdAt.toISOString(),
    })),
    fulfillmentTimeline: (order.orderEvents ?? []).map((event) => ({
      id: event.id,
      eventType: event.eventType,
      message: event.message,
      metadata: event.metadata,
      createdAt: event.createdAt.toISOString(),
    })),
    clientTrace: {
      customerId: (traceRaw.customerId as string | null) ?? order.userId ?? null,
      customerEmail: (traceRaw.customerEmail as string | null) ?? customerEmail ?? null,
      phone: (traceRaw.phone as string | null) ?? customerPhone ?? null,
      ipAddress: (traceRaw.ipAddress as string | null) ?? null,
      userAgent: (traceRaw.userAgent as string | null) ?? null,
      deviceInfo: traceRaw.deviceInfo ?? null,
      capturedAt: (traceRaw.capturedAt as string | null) ?? null,
    },
    pinRevealHistory: pinAccessLogs.map((log) => ({
      id: log.id,
      cardId: log.cardId,
      viewedBy: log.admin.fullName ?? log.admin.email,
      viewedByEmail: log.admin.email,
      viewedAt: log.createdAt.toISOString(),
    })),
    order: base,
  };
}

export { mapOrderItem };
