import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  FulfillmentStatus,
  OrderPaymentStatus,
  PaymentRecordStatus,
  RefundAttemptStatus,
  RefundCurrency,
  RefundEsimGate,
  RefundIntendedMethod,
  RefundReconStatus,
  RefundRequestStatus,
  UserRole,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { ADMIN_AUDIT_ACTIONS } from '../entities/admin.constants';
import { refundAuditContainsSensitiveData } from '../entities/refund-audit';
import { RefundRequestService } from './refund-request.service';

describe('REFUND-04C RefundRequestService reconcile', () => {
  const ORDER_ID = '11111111-1111-4111-8111-111111111111';
  const PAYMENT_A = '22222222-2222-4222-8222-222222222222';
  const PAYMENT_B = '33333333-3333-4333-8333-333333333333';
  const EXECUTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const VERIFIER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const REQUEST_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const REQUEST_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const ATTEMPT_A = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const ATTEMPT_B = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

  function harness(options?: {
    actorId?: string;
    actorRole?: UserRole;
    executorRole?: UserRole;
    orderStatus?: OrderPaymentStatus;
    payments?: Array<{ id: string; amount: string; status?: PaymentRecordStatus }>;
    requests?: Array<{
      id: string;
      paymentId: string;
      amount: string;
      status: RefundRequestStatus;
      attempts: Array<{
        id: string;
        amount: string;
        status: RefundAttemptStatus;
        reconStatus?: RefundReconStatus;
        executedById?: string;
        openGuard?: string | null;
      }>;
    }>;
  }) {
    const payments = (options?.payments ?? [
      { id: PAYMENT_A, amount: '100000.00', status: PaymentRecordStatus.SUCCESS },
    ]).map((payment) => ({
      id: payment.id,
      orderId: ORDER_ID,
      amount: new Decimal(payment.amount),
      status: payment.status ?? PaymentRecordStatus.SUCCESS,
    }));
    const requests = (options?.requests ?? []).map((request) => ({
      id: request.id,
      orderId: ORDER_ID,
      paymentId: request.paymentId,
      amount: new Decimal(request.amount),
      currency: RefundCurrency.VND,
      status: request.status,
      intendedMethod: RefundIntendedMethod.BANK_PAYOUT,
      esimGate: RefundEsimGate.NONE,
      reason: 'fixture',
      evidence: {},
      attempts: request.attempts.map((attempt) => ({
        id: attempt.id,
        requestId: request.id,
        amount: new Decimal(attempt.amount),
        currency: RefundCurrency.VND,
        status: attempt.status,
        reconStatus: attempt.reconStatus ?? RefundReconStatus.PENDING_VERIFY,
        method: RefundIntendedMethod.BANK_PAYOUT,
        executedById: attempt.executedById ?? EXECUTOR_ID,
        verifiedById: null as string | null,
        statementEvidenceRef: null as string | null,
        openGuard: attempt.openGuard ?? null,
        bankTransactionReference: attempt.status === RefundAttemptStatus.SUCCEEDED ? 'FT-1' : null,
        transferredAt: attempt.status === RefundAttemptStatus.SUCCEEDED ? new Date() : null,
      })),
    }));
    const order = {
      id: ORDER_ID,
      paymentStatus: options?.orderStatus ?? OrderPaymentStatus.PAID,
      fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW,
    };

    const orderUpdate = jest.fn();
    const paymentUpdate = jest.fn();
    const ledgerCreate = jest.fn();
    const providerRefund = jest.fn();
    const queueAdd = jest.fn();
    const audit = { record: jest.fn() };
    let queue = Promise.resolve();

    const repository = {
      runTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const run = queue.then(() => fn({}));
        queue = run.then(
          () => undefined,
          () => undefined,
        );
        return run;
      }),
      lockOrderForUpdate: jest.fn(async () => [{ id: ORDER_ID }]),
      lockPaymentForUpdate: jest.fn(async (id: string) =>
        payments.some((row) => row.id === id) ? [{ id }] : [],
      ),
      lockRequestForUpdate: jest.fn(async (id: string) =>
        requests.some((row) => row.id === id) ? [{ id }] : [],
      ),
      lockAttemptForUpdate: jest.fn(async (id: string) => {
        const found = requests.some((row) => row.attempts.some((attempt) => attempt.id === id));
        return found ? [{ id }] : [];
      }),
      findOrderHeader: jest.fn(async () => order),
      findPaymentById: jest.fn(async (id: string) => payments.find((row) => row.id === id) ?? null),
      listSuccessPaymentsForOrder: jest.fn(async () =>
        payments.filter((row) => row.status === PaymentRecordStatus.SUCCESS),
      ),
      listRequestsForOrder: jest.fn(async () => requests),
      listRequestsForPayment: jest.fn(async (paymentId: string) =>
        requests.filter((row) => row.paymentId === paymentId),
      ),
      findRequestById: jest.fn(async (id: string) => requests.find((row) => row.id === id) ?? null),
      findAttemptById: jest.fn(async (id: string) => {
        for (const request of requests) {
          const attempt = request.attempts.find((row) => row.id === id);
          if (attempt) {
            return { ...attempt, request };
          }
        }
        return null;
      }),
      updateAttempt: jest.fn(async (id: string, data: Record<string, unknown>) => {
        for (const request of requests) {
          const attempt = request.attempts.find((row) => row.id === id);
          if (!attempt) continue;
          Object.assign(attempt, data);
          const verifiedBy = data.verifiedBy as { connect?: { id?: string } } | undefined;
          if (verifiedBy?.connect?.id) {
            attempt.verifiedById = verifiedBy.connect.id;
          }
          return attempt;
        }
        return null;
      }),
      updateRequest: jest.fn(async (id: string, data: Record<string, unknown>) => {
        const request = requests.find((row) => row.id === id);
        if (!request) return null;
        if (data.status) request.status = data.status as RefundRequestStatus;
        return request;
      }),
      updateOrderPaymentStatus: jest.fn(async (_id: string, paymentStatus: OrderPaymentStatus) => {
        orderUpdate();
        order.paymentStatus = paymentStatus;
        return order;
      }),
      findActor: jest.fn(async (id: string) => {
        if (id === EXECUTOR_ID) {
          return { id: EXECUTOR_ID, role: options?.executorRole ?? UserRole.ADMIN };
        }
        if (id === VERIFIER_ID) {
          return { id: VERIFIER_ID, role: options?.actorRole ?? UserRole.ACCOUNTANT };
        }
        return { id, role: options?.actorRole ?? UserRole.ACCOUNTANT };
      }),
    };

    const rbac = {
      roleHasPermission: jest.fn(async (_role: UserRole, permission: string) => {
        if (permission === 'refund.reconcile') {
          return ['ACCOUNTANT', 'SUPER_ADMIN'].includes(_role);
        }
        return false;
      }),
    };

    const service = new RefundRequestService(
      repository as never,
      rbac as never,
      audit as never,
    );

    return {
      service,
      repository,
      audit,
      order,
      payments,
      requests,
      orderUpdate,
      paymentUpdate,
      ledgerCreate,
      providerRefund,
      queueAdd,
    };
  }

  const fullCover = {
    requests: [
      {
        id: REQUEST_A,
        paymentId: PAYMENT_A,
        amount: '100000.00',
        status: RefundRequestStatus.SUCCEEDED,
        attempts: [
          {
            id: ATTEMPT_A,
            amount: '100000.00',
            status: RefundAttemptStatus.SUCCEEDED,
            reconStatus: RefundReconStatus.PENDING_VERIFY,
            executedById: EXECUTOR_ID,
          },
        ],
      },
    ],
  };

  it('1. executor cannot self-reconcile, including SUPER_ADMIN', async () => {
    const sameAccountant = harness({
      executorRole: UserRole.ACCOUNTANT,
      ...fullCover,
    });
    await expect(
      sameAccountant.service.reconcile(EXECUTOR_ID, ATTEMPT_A, {
        decision: 'VERIFIED',
        statementEvidenceRef: 'STMT-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const superAdmin = harness({
      actorRole: UserRole.SUPER_ADMIN,
      executorRole: UserRole.SUPER_ADMIN,
      ...fullCover,
    });
    await expect(
      superAdmin.service.reconcile(EXECUTOR_ID, ATTEMPT_A, {
        decision: 'VERIFIED',
        statementEvidenceRef: 'STMT-1',
      }),
    ).rejects.toThrow('Cannot reconcile a refund attempt you executed');
  });

  it('2. a different accountant can VERIFIED a succeeded attempt', async () => {
    const { service, audit, order } = harness(fullCover);
    const result = await service.reconcile(VERIFIER_ID, ATTEMPT_A, {
      decision: 'VERIFIED',
      statementEvidenceRef: 'STMT-LINE-88',
    });
    expect(result.attempt?.reconStatus).toBe(RefundReconStatus.VERIFIED);
    expect(result.attempt?.status).toBe(RefundAttemptStatus.SUCCEEDED);
    expect(result.attempt?.verifiedById).toBe(VERIFIER_ID);
    expect(result.orderMarkedRefunded).toBe(true);
    expect(result.orderPaymentStatus).toBe(OrderPaymentStatus.REFUNDED);
    expect(order.paymentStatus).toBe(OrderPaymentStatus.REFUNDED);
    expect(audit.record).toHaveBeenCalledWith(
      VERIFIER_ID,
      ADMIN_AUDIT_ACTIONS.REFUND_RECON_VERIFIED,
      expect.anything(),
      ORDER_ID,
      expect.objectContaining({ statementEvidenceRef: 'STMT-LINE-88' }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      VERIFIER_ID,
      ADMIN_AUDIT_ACTIONS.REFUND_ORDER_MARKED_REFUNDED,
      expect.anything(),
      ORDER_ID,
      expect.objectContaining({ orderMarkedRefunded: true }),
    );
  });

  it('3. roles without refund.reconcile are rejected', async () => {
    const support = harness({ actorRole: UserRole.SUPPORT, ...fullCover });
    await expect(
      support.service.reconcile(VERIFIER_ID, ATTEMPT_A, {
        decision: 'VERIFIED',
        statementEvidenceRef: 'STMT-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const admin = harness({ actorRole: UserRole.ADMIN, ...fullCover });
    await expect(
      admin.service.reconcile(VERIFIER_ID, ATTEMPT_A, {
        decision: 'VERIFIED',
        statementEvidenceRef: 'STMT-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('4. attempts that are not SUCCEEDED cannot be reconciled', async () => {
    const { service } = harness({
      requests: [
        {
          id: REQUEST_A,
          paymentId: PAYMENT_A,
          amount: '100000.00',
          status: RefundRequestStatus.PROCESSING,
          attempts: [
            {
              id: ATTEMPT_A,
              amount: '100000.00',
              status: RefundAttemptStatus.SENT,
              executedById: EXECUTOR_ID,
              openGuard: REQUEST_A,
            },
          ],
        },
      ],
    });
    await expect(
      service.reconcile(VERIFIER_ID, ATTEMPT_A, {
        decision: 'VERIFIED',
        statementEvidenceRef: 'STMT-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('5. REJECTED moves the request to MANUAL_REVIEW without failing the attempt', async () => {
    const { service, requests, order, orderUpdate } = harness(fullCover);
    const result = await service.reconcile(VERIFIER_ID, ATTEMPT_A, {
      decision: 'REJECTED',
      statementEvidenceRef: 'STMT-MISMATCH',
    });
    expect(result.attempt?.status).toBe(RefundAttemptStatus.SUCCEEDED);
    expect(result.attempt?.reconStatus).toBe(RefundReconStatus.REJECTED);
    expect(result.status).toBe(RefundRequestStatus.MANUAL_REVIEW);
    expect(requests[0].status).toBe(RefundRequestStatus.MANUAL_REVIEW);
    expect(result.orderMarkedRefunded).toBe(false);
    expect(order.paymentStatus).toBe(OrderPaymentStatus.PAID);
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it('6. a partial refund keeps the order PAID', async () => {
    const { service, order } = harness({
      requests: [
        {
          id: REQUEST_A,
          paymentId: PAYMENT_A,
          amount: '40000.00',
          status: RefundRequestStatus.SUCCEEDED,
          attempts: [
            {
              id: ATTEMPT_A,
              amount: '40000.00',
              status: RefundAttemptStatus.SUCCEEDED,
              executedById: EXECUTOR_ID,
            },
          ],
        },
      ],
    });
    const result = await service.reconcile(VERIFIER_ID, ATTEMPT_A, {
      decision: 'VERIFIED',
      statementEvidenceRef: 'STMT-PARTIAL',
    });
    expect(result.attempt?.reconStatus).toBe(RefundReconStatus.VERIFIED);
    expect(result.orderMarkedRefunded).toBe(false);
    expect(order.paymentStatus).toBe(OrderPaymentStatus.PAID);
  });

  it('7. a multi-payment order is REFUNDED only after every SUCCESS payment is covered', async () => {
    const shared = {
      payments: [
        { id: PAYMENT_A, amount: '100000.00' },
        { id: PAYMENT_B, amount: '50000.00' },
      ],
      requests: [
        {
          id: REQUEST_A,
          paymentId: PAYMENT_A,
          amount: '100000.00',
          status: RefundRequestStatus.SUCCEEDED,
          attempts: [
            {
              id: ATTEMPT_A,
              amount: '100000.00',
              status: RefundAttemptStatus.SUCCEEDED,
              reconStatus: RefundReconStatus.PENDING_VERIFY,
              executedById: EXECUTOR_ID,
            },
          ],
        },
        {
          id: REQUEST_B,
          paymentId: PAYMENT_B,
          amount: '50000.00',
          status: RefundRequestStatus.SUCCEEDED,
          attempts: [
            {
              id: ATTEMPT_B,
              amount: '50000.00',
              status: RefundAttemptStatus.SUCCEEDED,
              reconStatus: RefundReconStatus.PENDING_VERIFY,
              executedById: EXECUTOR_ID,
            },
          ],
        },
      ],
    };
    const first = harness(shared);
    const afterFirst = await first.service.reconcile(VERIFIER_ID, ATTEMPT_A, {
      decision: 'VERIFIED',
      statementEvidenceRef: 'STMT-A',
    });
    expect(afterFirst.orderMarkedRefunded).toBe(false);
    expect(first.order.paymentStatus).toBe(OrderPaymentStatus.PAID);

    const firstAttempt = shared.requests[0].attempts[0] as {
      reconStatus: RefundReconStatus;
    };
    firstAttempt.reconStatus = RefundReconStatus.VERIFIED;
    const second = harness(shared);
    const afterSecond = await second.service.reconcile(VERIFIER_ID, ATTEMPT_B, {
      decision: 'VERIFIED',
      statementEvidenceRef: 'STMT-B',
    });
    expect(afterSecond.orderMarkedRefunded).toBe(true);
    expect(second.order.paymentStatus).toBe(OrderPaymentStatus.REFUNDED);
  });

  it('8. SUCCEEDED without VERIFIED does not mark the order REFUNDED', async () => {
    const { service, order } = harness(fullCover);
    expect(order.paymentStatus).toBe(OrderPaymentStatus.PAID);
    await expect(
      service.reconcile(VERIFIER_ID, ATTEMPT_A, {
        decision: 'REJECTED',
        statementEvidenceRef: 'STMT-NO',
      }),
    ).resolves.toEqual(expect.objectContaining({ orderMarkedRefunded: false }));
    expect(order.paymentStatus).toBe(OrderPaymentStatus.PAID);
  });

  it('9. an open request or attempt blocks Order REFUNDED', async () => {
    const { service, order } = harness({
      requests: [
        {
          id: REQUEST_A,
          paymentId: PAYMENT_A,
          amount: '100000.00',
          status: RefundRequestStatus.PROCESSING,
          attempts: [
            {
              id: ATTEMPT_A,
              amount: '40000.00',
              status: RefundAttemptStatus.SUCCEEDED,
              executedById: EXECUTOR_ID,
            },
            {
              id: ATTEMPT_B,
              amount: '60000.00',
              status: RefundAttemptStatus.UNCONFIRMED,
              openGuard: REQUEST_A,
            },
          ],
        },
      ],
    });
    const result = await service.reconcile(VERIFIER_ID, ATTEMPT_A, {
      decision: 'VERIFIED',
      statementEvidenceRef: 'STMT-OPEN',
    });
    expect(result.orderMarkedRefunded).toBe(false);
    expect(order.paymentStatus).toBe(OrderPaymentStatus.PAID);
  });

  it('10. over-refund and leftover reservation keep the order PAID', async () => {
    const { service, order } = harness({
      requests: [
        {
          id: REQUEST_A,
          paymentId: PAYMENT_A,
          amount: '80000.00',
          status: RefundRequestStatus.SUCCEEDED,
          attempts: [
            {
              id: ATTEMPT_A,
              amount: '80000.00',
              status: RefundAttemptStatus.SUCCEEDED,
              executedById: EXECUTOR_ID,
            },
          ],
        },
        {
          id: REQUEST_B,
          paymentId: PAYMENT_A,
          amount: '40000.00',
          status: RefundRequestStatus.SUCCEEDED,
          attempts: [
            {
              id: ATTEMPT_B,
              amount: '40000.00',
              status: RefundAttemptStatus.SUCCEEDED,
              reconStatus: RefundReconStatus.VERIFIED,
              executedById: EXECUTOR_ID,
            },
          ],
        },
      ],
    });
    const result = await service.reconcile(VERIFIER_ID, ATTEMPT_A, {
      decision: 'VERIFIED',
      statementEvidenceRef: 'STMT-OVER',
    });
    expect(result.orderMarkedRefunded).toBe(false);
    expect(order.paymentStatus).toBe(OrderPaymentStatus.PAID);
  });

  it('11. concurrent reconciles cannot create a split order state', async () => {
    const { service, order, repository } = harness(fullCover);
    const [first, second] = await Promise.allSettled([
      service.reconcile(VERIFIER_ID, ATTEMPT_A, {
        decision: 'VERIFIED',
        statementEvidenceRef: 'STMT-RACE-1',
      }),
      service.reconcile(VERIFIER_ID, ATTEMPT_A, {
        decision: 'VERIFIED',
        statementEvidenceRef: 'STMT-RACE-2',
      }),
    ]);
    expect(first.status).toBe('fulfilled');
    expect(second.status).toBe('rejected');
    if (second.status === 'rejected') {
      expect(second.reason).toBeInstanceOf(ConflictException);
    }
    expect(order.paymentStatus).toBe(OrderPaymentStatus.REFUNDED);
    expect(repository.updateOrderPaymentStatus).toHaveBeenCalledTimes(1);
  });

  it('12. payment, fulfillment, wallet and ledger stay unchanged except Order.paymentStatus', async () => {
    const { service, payments, order, paymentUpdate, ledgerCreate } = harness(fullCover);
    const beforeFulfillment = order.fulfillmentStatus;
    await service.reconcile(VERIFIER_ID, ATTEMPT_A, {
      decision: 'VERIFIED',
      statementEvidenceRef: 'STMT-SAFE',
    });
    expect(payments[0].status).toBe(PaymentRecordStatus.SUCCESS);
    expect(order.fulfillmentStatus).toBe(beforeFulfillment);
    expect(paymentUpdate).not.toHaveBeenCalled();
    expect(ledgerCreate).not.toHaveBeenCalled();
  });

  it('13. audit metadata stays free of secrets and raw bank data', async () => {
    const { service, audit } = harness(fullCover);
    await service.reconcile(VERIFIER_ID, ATTEMPT_A, {
      decision: 'VERIFIED',
      statementEvidenceRef: 'STMT-SAFE',
    });
    for (const call of audit.record.mock.calls) {
      const metadata = call[4] as Record<string, unknown>;
      expect(refundAuditContainsSensitiveData(metadata)).toBe(false);
      expect(JSON.stringify(metadata)).not.toMatch(/pin|lpa|secret|password|gatewayResponse/i);
      expect(metadata).not.toHaveProperty('rawStatement');
      expect(metadata).not.toHaveProperty('destinationHint');
    }
  });

  it('14. reconcile never calls a provider or enqueues a payout job', async () => {
    const { service, providerRefund, queueAdd } = harness(fullCover);
    await service.reconcile(VERIFIER_ID, ATTEMPT_A, {
      decision: 'VERIFIED',
      statementEvidenceRef: 'STMT-NOPROVIDER',
    });
    expect(providerRefund).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
  });
});
