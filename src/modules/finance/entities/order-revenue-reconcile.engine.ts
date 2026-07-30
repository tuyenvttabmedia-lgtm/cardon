import {
  FulfillmentStatus,
  OrderChannel,
  OrderPaymentStatus,
  PaymentRecordStatus,
  ProviderTransactionStatus,
  ReconcileMatchStatus,
} from '@prisma/client';

export type OrderRevenueIssueCode =
  | 'PAID_ORDER_MISSING_PAYMENT_SUCCESS'
  | 'PAYMENT_SUCCESS_ORDER_NOT_PAID'
  | 'COMPLETED_ORDER_MISSING_PROVIDER_SUCCESS'
  | 'PROVIDER_SUCCESS_ORDER_FAILED'
  | 'GATEWAY_STATUS_MISMATCH';

export interface OrderRevenueIssue {
  reference: string;
  orderId: string | null;
  orderCode: string | null;
  paymentReference: string | null;
  providerRequestId: string | null;
  matchStatus: ReconcileMatchStatus;
  issueCode: OrderRevenueIssueCode;
  localAmount: string | null;
  externalAmount: string | null;
  details: Record<string, unknown>;
}

export interface OrderRevenueOrderInput {
  id: string;
  orderCode: string;
  channel: OrderChannel | string;
  paymentStatus: OrderPaymentStatus | string;
  fulfillmentStatus: FulfillmentStatus | string;
  totalAmount: string;
  paymentReference: string | null;
  paymentStatusRecord: PaymentRecordStatus | string | null;
  hasCardOrTopupItem: boolean;
  latestProviderStatus: ProviderTransactionStatus | string | null;
  latestProviderRequestId: string | null;
  isSandbox: boolean;
}

export interface OrderRevenuePaymentInput {
  id: string;
  paymentReference: string;
  amount: string;
  status: PaymentRecordStatus | string;
  orderId: string;
  orderCode: string;
  orderPaymentStatus: OrderPaymentStatus | string;
  isSandbox: boolean;
}

export interface GatewayQueryLine {
  paymentReference: string;
  gatewayStatus: 'SUCCESS' | 'FAILED' | 'PENDING' | 'EXPIRED' | string;
  amount: string | null;
}

export function detectOrderRevenueIssues(input: {
  orders: OrderRevenueOrderInput[];
  payments: OrderRevenuePaymentInput[];
  gatewayQueries?: GatewayQueryLine[];
}): OrderRevenueIssue[] {
  const issues: OrderRevenueIssue[] = [];

  for (const order of input.orders) {
    if (order.isSandbox) continue;

    if (
      order.paymentStatus === OrderPaymentStatus.PAID &&
      order.channel !== OrderChannel.AGENT &&
      order.paymentStatusRecord !== PaymentRecordStatus.SUCCESS
    ) {
      issues.push({
        reference: order.orderCode,
        orderId: order.id,
        orderCode: order.orderCode,
        paymentReference: order.paymentReference,
        providerRequestId: order.latestProviderRequestId,
        matchStatus: ReconcileMatchStatus.MISSING_LOCAL,
        issueCode: 'PAID_ORDER_MISSING_PAYMENT_SUCCESS',
        localAmount: order.totalAmount,
        externalAmount: null,
        details: {
          paymentStatus: order.paymentStatus,
          paymentRecordStatus: order.paymentStatusRecord,
        },
      });
    }

    if (
      order.paymentStatus === OrderPaymentStatus.PAID &&
      order.fulfillmentStatus === FulfillmentStatus.COMPLETED &&
      order.hasCardOrTopupItem &&
      order.latestProviderStatus !== ProviderTransactionStatus.SUCCESS
    ) {
      issues.push({
        reference: order.orderCode,
        orderId: order.id,
        orderCode: order.orderCode,
        paymentReference: order.paymentReference,
        providerRequestId: order.latestProviderRequestId,
        matchStatus: ReconcileMatchStatus.MISSING_GATEWAY,
        issueCode: 'COMPLETED_ORDER_MISSING_PROVIDER_SUCCESS',
        localAmount: order.totalAmount,
        externalAmount: null,
        details: {
          fulfillmentStatus: order.fulfillmentStatus,
          latestProviderStatus: order.latestProviderStatus,
        },
      });
    }

    if (
      order.latestProviderStatus === ProviderTransactionStatus.SUCCESS &&
      order.fulfillmentStatus === FulfillmentStatus.FAILED
    ) {
      issues.push({
        reference: order.orderCode,
        orderId: order.id,
        orderCode: order.orderCode,
        paymentReference: order.paymentReference,
        providerRequestId: order.latestProviderRequestId,
        matchStatus: ReconcileMatchStatus.STATUS_MISMATCH,
        issueCode: 'PROVIDER_SUCCESS_ORDER_FAILED',
        localAmount: order.totalAmount,
        externalAmount: null,
        details: {
          fulfillmentStatus: order.fulfillmentStatus,
          latestProviderStatus: order.latestProviderStatus,
        },
      });
    }
  }

  for (const payment of input.payments) {
    if (payment.isSandbox) continue;
    if (
      payment.status === PaymentRecordStatus.SUCCESS &&
      payment.orderPaymentStatus !== OrderPaymentStatus.PAID
    ) {
      issues.push({
        reference: payment.paymentReference,
        orderId: payment.orderId,
        orderCode: payment.orderCode,
        paymentReference: payment.paymentReference,
        providerRequestId: null,
        matchStatus: ReconcileMatchStatus.STATUS_MISMATCH,
        issueCode: 'PAYMENT_SUCCESS_ORDER_NOT_PAID',
        localAmount: payment.amount,
        externalAmount: null,
        details: {
          paymentStatus: payment.status,
          orderPaymentStatus: payment.orderPaymentStatus,
        },
      });
    }
  }

  for (const gateway of input.gatewayQueries ?? []) {
    const payment = input.payments.find(
      (row) => row.paymentReference === gateway.paymentReference,
    );
    if (!payment || payment.isSandbox) continue;
    if (
      payment.status === PaymentRecordStatus.SUCCESS &&
      gateway.gatewayStatus !== 'SUCCESS' &&
      gateway.gatewayStatus !== 'PENDING'
    ) {
      issues.push({
        reference: gateway.paymentReference,
        orderId: payment.orderId,
        orderCode: payment.orderCode,
        paymentReference: gateway.paymentReference,
        providerRequestId: null,
        matchStatus: ReconcileMatchStatus.STATUS_MISMATCH,
        issueCode: 'GATEWAY_STATUS_MISMATCH',
        localAmount: payment.amount,
        externalAmount: gateway.amount,
        details: {
          localPaymentStatus: payment.status,
          gatewayStatus: gateway.gatewayStatus,
        },
      });
    }
  }

  return issues;
}

export function summarizeOrderRevenueIssues(issues: OrderRevenueIssue[]) {
  return {
    total: issues.length,
    matched: 0,
    mismatch: issues.length,
    byCode: issues.reduce<Record<string, number>>((acc, issue) => {
      acc[issue.issueCode] = (acc[issue.issueCode] ?? 0) + 1;
      return acc;
    }, {}),
  };
}
