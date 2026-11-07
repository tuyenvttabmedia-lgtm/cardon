import {
  FinancialTransactionStatus,
  FinancialTransactionType,
  FulfillmentStatus,
  OrderPaymentStatus,
  PaymentRecordStatus,
} from '@prisma/client';
import { AdminOrderService } from '../admin/services/admin-order.service';
import { PaymentExpirationService } from '../payment/services/payment-expiration.service';
import { FulfillmentDispatchService } from '../provider/services/fulfillment-dispatch.service';
import { ProviderService } from '../provider/services/provider.service';
import { TopupService } from '../provider/services/topup.service';
import { OrderRepository } from './repositories/order.repository';
import { OrderExpirationService } from './services/order-expiration.service';

/**
 * B3.56. Expiry and the admin refund mark do not read variant type.
 * GAME_CARD and PHONE_CARD are both variant type CARD. TOPUP and DATA share
 * the topup fulfillment guard. ESIM is refused by those guards.
 */
describe('B3.56 expiry, refund mark, and unpaid fulfillment', () => {
  function expiration(paymentStatus: OrderPaymentStatus, expiresAt: Date) {
    const txOrderUpdate = jest.fn();
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-1',
          orderCode: 'ORD-1',
          paymentStatus,
          paymentExpiresAt: expiresAt,
          deletedAt: null,
        }),
      },
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<void>) =>
        cb({ order: { update: txOrderUpdate } }),
      ),
    };
    const orderRepository = { failB2cFinancialTransaction: jest.fn() };
    const audit = { recordOrderExpired: jest.fn() };
    const service = new OrderExpirationService(
      prisma as never,
      orderRepository as never,
      audit as never,
    );
    return { service, prisma, orderRepository, audit, txOrderUpdate };
  }

  it('expires only a WAITING_PAYMENT order whose window has passed, without reading items', async () => {
    const { service, prisma, orderRepository, audit, txOrderUpdate } = expiration(
      OrderPaymentStatus.WAITING_PAYMENT,
      new Date('2020-01-01T00:00:00Z'),
    );

    await expect(service.expireOrder('order-1')).resolves.toBe(true);

    expect(prisma.order.findUnique).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      select: {
        id: true,
        orderCode: true,
        paymentStatus: true,
        paymentExpiresAt: true,
        deletedAt: true,
      },
    });
    expect(txOrderUpdate).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { paymentStatus: OrderPaymentStatus.EXPIRED },
    });
    expect(orderRepository.failB2cFinancialTransaction).toHaveBeenCalledTimes(1);
    expect(audit.recordOrderExpired).toHaveBeenCalledTimes(1);
  });

  it.each([
    OrderPaymentStatus.PAID,
    OrderPaymentStatus.FAILED,
    OrderPaymentStatus.REFUNDED,
    OrderPaymentStatus.EXPIRED,
  ])('does not expire a %s order or touch the B2C financial row', async (paymentStatus) => {
    const { service, orderRepository, audit, txOrderUpdate } = expiration(
      paymentStatus,
      new Date('2020-01-01T00:00:00Z'),
    );

    await expect(service.expireOrder('order-1')).resolves.toBe(false);
    expect(txOrderUpdate).not.toHaveBeenCalled();
    expect(orderRepository.failB2cFinancialTransaction).not.toHaveBeenCalled();
    expect(audit.recordOrderExpired).not.toHaveBeenCalled();
  });

  it('does not expire a WAITING_PAYMENT order still inside the payment window', async () => {
    const { service, orderRepository, txOrderUpdate } = expiration(
      OrderPaymentStatus.WAITING_PAYMENT,
      new Date(Date.now() + 60_000),
    );

    await expect(service.expireOrder('order-1')).resolves.toBe(false);
    expect(txOrderUpdate).not.toHaveBeenCalled();
    expect(orderRepository.failB2cFinancialTransaction).not.toHaveBeenCalled();
  });

  it('fails only a pending B2C checkout financial row', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const repository = new OrderRepository({
      financialTransaction: { updateMany },
    } as never);

    await repository.failB2cFinancialTransaction('order-1');

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        type: FinancialTransactionType.B2C_CHECKOUT,
        status: { in: [FinancialTransactionStatus.PENDING] },
        deletedAt: null,
        orders: { some: { id: 'order-1' } },
      },
      data: { status: FinancialTransactionStatus.FAILED },
    });
  });

  it('expires a pending payment without changing an already PAID order', async () => {
    const paymentRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'pay-1',
        orderId: 'order-1',
        status: PaymentRecordStatus.PENDING,
        expiresAt: new Date('2020-01-01T00:00:00Z'),
      }),
      updateStatus: jest.fn(),
    };
    const orderRepository = { updatePaymentStatus: jest.fn() };
    const prisma = {
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<void>) =>
        cb({
          order: {
            findUnique: jest.fn().mockResolvedValue({
              paymentStatus: OrderPaymentStatus.PAID,
            }),
          },
        }),
      ),
    };
    const service = new PaymentExpirationService(
      prisma as never,
      paymentRepository as never,
      orderRepository as never,
    );

    await expect(service.expirePayment('pay-1')).resolves.toBe(true);
    expect(paymentRepository.updateStatus).toHaveBeenCalledWith(
      'pay-1',
      PaymentRecordStatus.EXPIRED,
      undefined,
      expect.anything(),
    );
    expect(orderRepository.updatePaymentStatus).not.toHaveBeenCalled();
  });

  it('does not expire a payment that is no longer PENDING', async () => {
    const paymentRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'pay-1',
        orderId: 'order-1',
        status: PaymentRecordStatus.SUCCESS,
        expiresAt: new Date('2020-01-01T00:00:00Z'),
      }),
      updateStatus: jest.fn(),
    };
    const service = new PaymentExpirationService(
      { $transaction: jest.fn() } as never,
      paymentRepository as never,
      { updatePaymentStatus: jest.fn() } as never,
    );

    await expect(service.expirePayment('pay-1')).resolves.toBe(false);
    expect(paymentRepository.updateStatus).not.toHaveBeenCalled();
  });

  function adminRecovery(order: {
    paymentStatus: OrderPaymentStatus;
    fulfillmentStatus: FulfillmentStatus;
    orderItems?: Array<{ variant: { type: string; product?: { homeService: string } } }>;
  }) {
    const updateOrderFulfillmentStatus = jest.fn();
    const updatePaymentStatus = jest.fn();
    const retry = jest.fn();
    const acknowledge = jest.fn();
    const audit = jest.fn();
    const createForOrder = jest.fn().mockResolvedValue({
      id: 'refund-1',
      orderId: 'order-1',
      paymentId: 'pay-1',
      amount: '100000.00',
      currency: 'VND',
      status: 'REQUESTED',
      intendedMethod: 'BANK_PAYOUT',
      esimGate: 'NONE',
      requiresManualReview: false,
      fulfillmentUnchanged: true,
    });
    const service = new AdminOrderService(
      {
        findOrderById: async () => ({
          ...order,
          providerTransactions: [],
        }),
        updateOrderFulfillmentStatus,
        updatePaymentStatus,
      } as never,
      { retryOrderFulfillment: retry } as never,
      { record: audit } as never,
      {} as never,
      {} as never,
      { isEsimOrder: async () => false, acknowledge } as never,
      { createForOrder } as never,
    );
    return {
      service,
      updateOrderFulfillmentStatus,
      updatePaymentStatus,
      retry,
      acknowledge,
      audit,
      createForOrder,
    };
  }

  it.each([
    ['GAME_CARD', 'CARD'],
    ['PHONE_CARD', 'CARD'],
    ['TOPUP', 'TOPUP'],
    ['DATA', 'DATA'],
    ['ESIM', 'ESIM'],
  ] as const)(
    'creates a refund request for a %s order without changing payment, fulfillment, or calling a provider',
    async (homeService, type) => {
      const {
        service,
        updateOrderFulfillmentStatus,
        updatePaymentStatus,
        retry,
        acknowledge,
        audit,
        createForOrder,
      } = adminRecovery({
        paymentStatus: OrderPaymentStatus.PAID,
        fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW,
        orderItems: [{ variant: { type, product: { homeService } } }],
      });

      const result = await service.manualRecovery('admin-1', 'order-1', {
        action: 'refund',
        note: 'audit only',
      } as never);

      expect(result).toEqual(
        expect.objectContaining({
          id: 'refund-1',
          status: 'REQUESTED',
          fulfillmentUnchanged: true,
        }),
      );
      expect(createForOrder).toHaveBeenCalledWith(
        'admin-1',
        'order-1',
        expect.objectContaining({ reason: 'audit only' }),
      );
      expect(updateOrderFulfillmentStatus).not.toHaveBeenCalled();
      expect(updatePaymentStatus).not.toHaveBeenCalled();
      expect(retry).not.toHaveBeenCalled();
      expect(acknowledge).not.toHaveBeenCalled();
      expect(audit).not.toHaveBeenCalled();
    },
  );

  it('creates a refund request even when fulfillment is COMPLETED', async () => {
    const { service, updateOrderFulfillmentStatus, createForOrder } = adminRecovery({
      paymentStatus: OrderPaymentStatus.PAID,
      fulfillmentStatus: FulfillmentStatus.COMPLETED,
    });

    await service.manualRecovery('admin-1', 'order-1', { action: 'refund' } as never);
    expect(createForOrder).toHaveBeenCalled();
    expect(updateOrderFulfillmentStatus).not.toHaveBeenCalled();
  });

  it('keeps manual-recovery retry for an eSIM-only order off the card and topup providers', async () => {
    const providerService = {
      retryFulfillment: jest.fn(),
      retryFulfillmentWithOptions: jest.fn(),
    };
    const topupService = { retryFulfillment: jest.fn() };
    const esimQueue = { enqueueFulfillment: jest.fn() };
    const providerQueue = { enqueueFulfillment: jest.fn() };
    const topupQueue = { enqueueFulfillment: jest.fn() };
    const dispatch = new FulfillmentDispatchService(
      {
        findOrderForFulfillment: async () => ({
          orderItems: [{ variant: { type: 'ESIM' } }],
        }),
      } as never,
      providerQueue as never,
      topupQueue as never,
      providerService as never,
      topupService as never,
      esimQueue as never,
    );
    const acknowledge = jest.fn();
    const service = new AdminOrderService(
      {
        findOrderById: async () => ({
          paymentStatus: OrderPaymentStatus.PAID,
          fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW,
          providerTransactions: [],
        }),
      } as never,
      dispatch,
      { record: jest.fn() } as never,
      {} as never,
      {} as never,
      { isEsimOrder: async () => true, acknowledge } as never,
    );

    await expect(
      service.manualRecovery('admin-1', 'order-1', { action: 'retry' } as never),
    ).rejects.toThrow('eSIM orders are not retried through the card provider');
    expect(providerService.retryFulfillment).not.toHaveBeenCalled();
    expect(providerService.retryFulfillmentWithOptions).not.toHaveBeenCalled();
    expect(topupService.retryFulfillment).not.toHaveBeenCalled();
    expect(esimQueue.enqueueFulfillment).not.toHaveBeenCalled();
    expect(providerQueue.enqueueFulfillment).not.toHaveBeenCalled();
    expect(topupQueue.enqueueFulfillment).not.toHaveBeenCalled();
    expect(acknowledge).not.toHaveBeenCalled();
  });

  function cardProvider(order: {
    paymentStatus: OrderPaymentStatus;
    items: Array<{ variant: { type: string; product?: { homeService: string } } }>;
  }) {
    const listForVariant = jest.fn();
    const service = new ProviderService(
      {} as never,
      { listForVariant } as never,
      {} as never,
      {
        findOrderForFulfillment: async () => ({
          paymentStatus: order.paymentStatus,
          clientTrace: {},
          orderItems: order.items,
        }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, listForVariant };
  }

  it.each(['GAME_CARD', 'PHONE_CARD'] as const)(
    'does not buy a card for an unpaid %s order',
    async (homeService) => {
      const { service, listForVariant } = cardProvider({
        paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
        items: [{ variant: { type: 'CARD', product: { homeService } } }],
      });

      await expect(service.fulfillOrder('order-1')).rejects.toThrow('Order is not paid');
      expect(listForVariant).not.toHaveBeenCalled();
    },
  );

  it('does not buy a card for a paid eSIM order', async () => {
    const { service, listForVariant } = cardProvider({
      paymentStatus: OrderPaymentStatus.PAID,
      items: [{ variant: { type: 'ESIM', product: { homeService: 'ESIM' } } }],
    });

    await expect(service.retryFulfillment('order-1')).rejects.toThrow('No CARD items to fulfill');
    expect(listForVariant).not.toHaveBeenCalled();
  });

  function topupProvider(order: {
    paymentStatus: OrderPaymentStatus;
    type: 'TOPUP' | 'DATA' | 'ESIM';
  }) {
    const listForVariant = jest.fn();
    const service = new TopupService(
      {} as never,
      { listForVariant } as never,
      {} as never,
      {
        findOrderForFulfillment: async () => ({
          paymentStatus: order.paymentStatus,
          orderItems: [{ variant: { type: order.type } }],
        }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, listForVariant };
  }

  it.each(['TOPUP', 'DATA'] as const)(
    'does not top up an unpaid %s order',
    async (type) => {
      const { service, listForVariant } = topupProvider({
        paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
        type,
      });

      await expect(service.fulfillOrder('order-1')).rejects.toThrow('Order is not paid');
      expect(listForVariant).not.toHaveBeenCalled();
    },
  );

  it('does not top up a paid eSIM order', async () => {
    const { service, listForVariant } = topupProvider({
      paymentStatus: OrderPaymentStatus.PAID,
      type: 'ESIM',
    });

    await expect(service.retryFulfillment('order-1')).rejects.toThrow('No TOPUP items to fulfill');
    expect(listForVariant).not.toHaveBeenCalled();
  });
});
