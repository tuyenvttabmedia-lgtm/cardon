import {
  FulfillmentStatus,
  OrderChannel,
  OrderPaymentStatus,
  PaymentRecordStatus,
  ProviderTransactionStatus,
  ReconcileMatchStatus,
} from '@prisma/client';
import {
  detectOrderRevenueIssues,
  summarizeOrderRevenueIssues,
} from './order-revenue-reconcile.engine';

describe('order-revenue-reconcile.engine', () => {
  it('does not require provider SUCCESS when the order has no card or topup item', () => {
    const issues = detectOrderRevenueIssues({
      orders: [
        {
          id: 'o-esim',
          orderCode: 'ORD-ESIM',
          channel: OrderChannel.B2C,
          paymentStatus: OrderPaymentStatus.PAID,
          fulfillmentStatus: FulfillmentStatus.COMPLETED,
          totalAmount: '150000.00',
          paymentReference: 'PAY-ESIM',
          paymentStatusRecord: PaymentRecordStatus.SUCCESS,
          hasCardOrTopupItem: false,
          latestProviderStatus: null,
          latestProviderRequestId: null,
          isSandbox: false,
        },
      ],
      payments: [],
    });

    expect(
      issues.some((issue) => issue.issueCode === 'COMPLETED_ORDER_MISSING_PROVIDER_SUCCESS'),
    ).toBe(false);
  });

  it('flags a paid B2C order without a SUCCESS payment record', () => {
    const issues = detectOrderRevenueIssues({
      orders: [
        {
          id: 'o1',
          orderCode: 'ORD-1',
          channel: OrderChannel.B2C,
          paymentStatus: OrderPaymentStatus.PAID,
          fulfillmentStatus: FulfillmentStatus.PENDING,
          totalAmount: '100000.00',
          paymentReference: null,
          paymentStatusRecord: null,
          hasCardOrTopupItem: true,
          latestProviderStatus: null,
          latestProviderRequestId: null,
          isSandbox: false,
        },
      ],
      payments: [],
    });

    expect(issues).toEqual([
      expect.objectContaining({
        issueCode: 'PAID_ORDER_MISSING_PAYMENT_SUCCESS',
        matchStatus: ReconcileMatchStatus.MISSING_LOCAL,
      }),
    ]);
  });

  it('flags completed orders missing provider SUCCESS and payment SUCCESS orphans', () => {
    const issues = detectOrderRevenueIssues({
      orders: [
        {
          id: 'o2',
          orderCode: 'ORD-2',
          channel: OrderChannel.B2C,
          paymentStatus: OrderPaymentStatus.PAID,
          fulfillmentStatus: FulfillmentStatus.COMPLETED,
          totalAmount: '20000.00',
          paymentReference: 'PAY-2',
          paymentStatusRecord: PaymentRecordStatus.SUCCESS,
          hasCardOrTopupItem: true,
          latestProviderStatus: ProviderTransactionStatus.FAILED,
          latestProviderRequestId: 'PRV-2',
          isSandbox: false,
        },
      ],
      payments: [
        {
          id: 'p2',
          paymentReference: 'PAY-2',
          amount: '20000.00',
          status: PaymentRecordStatus.SUCCESS,
          orderId: 'o2',
          orderCode: 'ORD-2',
          orderPaymentStatus: OrderPaymentStatus.PAID,
          isSandbox: false,
        },
        {
          id: 'p3',
          paymentReference: 'PAY-3',
          amount: '30000.00',
          status: PaymentRecordStatus.SUCCESS,
          orderId: 'o3',
          orderCode: 'ORD-3',
          orderPaymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
          isSandbox: false,
        },
      ],
      gatewayQueries: [
        {
          paymentReference: 'PAY-2',
          gatewayStatus: 'FAILED',
          amount: '20000.00',
        },
      ],
    });

    expect(issues.map((i) => i.issueCode).sort()).toEqual([
      'COMPLETED_ORDER_MISSING_PROVIDER_SUCCESS',
      'GATEWAY_STATUS_MISMATCH',
      'PAYMENT_SUCCESS_ORDER_NOT_PAID',
    ]);
    expect(summarizeOrderRevenueIssues(issues).mismatch).toBe(3);
  });

  it('ignores sandbox rows', () => {
    const issues = detectOrderRevenueIssues({
      orders: [
        {
          id: 'o4',
          orderCode: 'ORD-4',
          channel: OrderChannel.AGENT,
          paymentStatus: OrderPaymentStatus.PAID,
          fulfillmentStatus: FulfillmentStatus.COMPLETED,
          totalAmount: '10000.00',
          paymentReference: null,
          paymentStatusRecord: null,
          hasCardOrTopupItem: true,
          latestProviderStatus: null,
          latestProviderRequestId: null,
          isSandbox: true,
        },
      ],
      payments: [],
    });
    expect(issues).toEqual([]);
  });

  it('drops a boolean admin test from commercial issues and keeps a string marker', () => {
    const customer = {
      id: 'customer',
      orderCode: 'ORD-CUSTOMER',
      channel: OrderChannel.B2C,
      paymentStatus: OrderPaymentStatus.PAID,
      fulfillmentStatus: FulfillmentStatus.PENDING,
      totalAmount: '100000.00',
      paymentReference: 'PAY-CUSTOMER',
      paymentStatusRecord: null,
      hasCardOrTopupItem: false,
      latestProviderStatus: null,
      latestProviderRequestId: null,
      isSandbox: false,
      isAdminTest: false,
    };
    const adminTest = { ...customer, id: 'admin', orderCode: 'ORD-ADMIN', totalAmount: '103000.00', isAdminTest: true };
    const stringMarker = { ...customer, id: 'string', orderCode: 'ORD-STRING', isAdminTest: false };
    const issues = detectOrderRevenueIssues({
      orders: [customer, adminTest, stringMarker],
      payments: [
        {
          id: 'pay-admin',
          paymentReference: 'PAY-ADMIN',
          amount: '1.00',
          status: PaymentRecordStatus.SUCCESS,
          orderId: 'admin',
          orderCode: 'ORD-ADMIN',
          orderPaymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
          isSandbox: false,
          isAdminTest: true,
        },
        {
          id: 'pay-customer',
          paymentReference: 'PAY-CUSTOMER',
          amount: '100000.00',
          status: PaymentRecordStatus.SUCCESS,
          orderId: 'customer',
          orderCode: 'ORD-CUSTOMER',
          orderPaymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
          isSandbox: false,
          isAdminTest: false,
        },
      ],
    });
    expect([...new Set(issues.map((issue) => issue.orderCode))].sort()).toEqual([
      'ORD-CUSTOMER',
      'ORD-STRING',
    ]);
    expect(issues.some((issue) => issue.orderCode === 'ORD-ADMIN')).toBe(false);
    expect(adminTest.totalAmount).toBe('103000.00');
  });
});
