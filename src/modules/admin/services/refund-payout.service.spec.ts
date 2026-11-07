import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  PaymentGatewayCode,
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

describe('REFUND-04B RefundRequestService payout', () => {
  const ORDER_ID = '11111111-1111-4111-8111-111111111111';
  const PAYMENT_ID = '22222222-2222-4222-8222-222222222222';
  const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const APPROVER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const REQUEST_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const OTHER_REQUEST_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  function harness(options?: {
    role?: UserRole;
    request?: Partial<{
      id: string;
      status: RefundRequestStatus;
      amount: Decimal;
      intendedMethod: RefundIntendedMethod;
      esimGate: RefundEsimGate;
      evidence: Record<string, unknown>;
      requestedById: string;
    }>;
    extraRequests?: Array<{
      id: string;
      amount: Decimal;
      status: RefundRequestStatus;
      attempts: Array<{
        id?: string;
        amount: Decimal;
        status: RefundAttemptStatus;
        bankTransactionReference?: string | null;
      }>;
    }>;
    seedAttempts?: Array<{
      id: string;
      requestId?: string;
      amount?: Decimal;
      status: RefundAttemptStatus;
      bankTransactionReference?: string | null;
      transferredAt?: Date | null;
      openGuard?: string | null;
      idempotencyKey?: string;
      errorCode?: string | null;
    }>;
    duplicateBankReferences?: Array<{ id: string; bankTransactionReference: string }>;
  }) {
    const payment = {
      id: PAYMENT_ID,
      orderId: ORDER_ID,
      amount: new Decimal('100000.00'),
      status: PaymentRecordStatus.SUCCESS,
      gateway: PaymentGatewayCode.SEPAY,
    };
    const attempts: Array<Record<string, unknown>> = [];
    const requests: Array<Record<string, unknown>> = [
      {
        id: REQUEST_ID,
        orderId: ORDER_ID,
        paymentId: PAYMENT_ID,
        amount: options?.request?.amount ?? new Decimal('100000.00'),
        currency: RefundCurrency.VND,
        status: options?.request?.status ?? RefundRequestStatus.APPROVED,
        intendedMethod: options?.request?.intendedMethod ?? RefundIntendedMethod.BANK_PAYOUT,
        esimGate: options?.request?.esimGate ?? RefundEsimGate.NONE,
        reason: 'fixture',
        requestedById: options?.request?.requestedById ?? ADMIN_ID,
        evidence: options?.request?.evidence ?? {},
        attempts,
      },
    ];
    for (const extra of options?.extraRequests ?? []) {
      requests.push({
        id: extra.id,
        orderId: ORDER_ID,
        paymentId: PAYMENT_ID,
        amount: extra.amount,
        currency: RefundCurrency.VND,
        status: extra.status,
        intendedMethod: RefundIntendedMethod.BANK_PAYOUT,
        esimGate: RefundEsimGate.NONE,
        reason: 'extra',
        requestedById: ADMIN_ID,
        evidence: {},
        attempts: extra.attempts.map((attempt, index) => ({
          id: attempt.id ?? `extra-att-${index}`,
          requestId: extra.id,
          amount: attempt.amount,
          status: attempt.status,
          currency: RefundCurrency.VND,
          method: RefundIntendedMethod.BANK_PAYOUT,
          bankTransactionReference: attempt.bankTransactionReference ?? null,
          transferredAt: null,
          openGuard: null,
          reconStatus: RefundReconStatus.PENDING_VERIFY,
        })),
      });
    }
    for (const seed of options?.seedAttempts ?? []) {
      const row = {
        id: seed.id,
        requestId: seed.requestId ?? REQUEST_ID,
        amount: seed.amount ?? new Decimal('100000.00'),
        currency: RefundCurrency.VND,
        status: seed.status,
        reconStatus: RefundReconStatus.PENDING_VERIFY,
        method: RefundIntendedMethod.BANK_PAYOUT,
        idempotencyKey: seed.idempotencyKey ?? `seed-${seed.id}`,
        openGuard: seed.openGuard ?? (seed.status === 'SENT' || seed.status === 'UNCONFIRMED' ? REQUEST_ID : null),
        executedById: ADMIN_ID,
        bankTransactionReference: seed.bankTransactionReference ?? null,
        transferredAt: seed.transferredAt ?? null,
        destinationHint: null,
        errorCode: seed.errorCode ?? null,
        safeRequestMeta: {
          kind: 'execute',
          requestId: seed.requestId ?? REQUEST_ID,
          amount: (seed.amount ?? new Decimal('100000.00')).toFixed(2),
          currency: 'VND',
          method: 'BANK_PAYOUT',
        },
      };
      attempts.push(row);
    }

    const orderUpdate = jest.fn();
    const paymentUpdate = jest.fn();
    const ledgerCreate = jest.fn();
    const providerRefund = jest.fn();
    const queueAdd = jest.fn();
    const audit = { record: jest.fn() };
    let queue = Promise.resolve();

    const rbac = {
      roleHasPermission: jest.fn(async (_role: UserRole, permission: string) => {
        if (permission === 'refund.request') {
          return ['SUPPORT', 'ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'].includes(_role);
        }
        if (permission === 'refund.approve') {
          return ['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'].includes(_role);
        }
        if (permission === 'refund.execute') {
          return ['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'].includes(_role);
        }
        return false;
      }),
    };

    const repository = {
      runTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = { $executeRaw: jest.fn().mockResolvedValue(undefined) };
        const run = queue.then(() => fn(tx));
        queue = run.then(
          () => undefined,
          () => undefined,
        );
        return run;
      }),
      lockPaymentForUpdate: jest.fn(async () => [{ id: payment.id }]),
      lockRequestForUpdate: jest.fn(async (id: string) =>
        requests.some((row) => row.id === id) ? [{ id }] : [],
      ),
      lockAttemptForUpdate: jest.fn(async (id: string) =>
        attempts.some((row) => row.id === id) ? [{ id }] : [],
      ),
      findPaymentById: jest.fn(async () => payment),
      listRequestsForPayment: jest.fn(async () => requests),
      findRequestById: jest.fn(async (id: string) => requests.find((row) => row.id === id) ?? null),
      updateRequest: jest.fn(async (id: string, data: Record<string, unknown>) => {
        const row = requests.find((item) => item.id === id);
        if (!row) return null;
        if (data.status) row.status = data.status;
        if (data.completedAt) row.completedAt = data.completedAt;
        if (data.evidence) row.evidence = data.evidence;
        return row;
      }),
      createAttempt: jest.fn(async (data: Record<string, unknown>) => {
        const created = {
          id: `att-${attempts.length + 1}`,
          status: RefundAttemptStatus.SENT,
          reconStatus: RefundReconStatus.PENDING_VERIFY,
          bankTransactionReference: null,
          destinationHint: null,
          transferredAt: null,
          errorCode: null,
          ...data,
        };
        attempts.push(created);
        return created;
      }),
      updateAttempt: jest.fn(async (id: string, data: Record<string, unknown>) => {
        const row = attempts.find((item) => item.id === id);
        if (!row) return null;
        Object.assign(row, data);
        if ('openGuard' in data) {
          row.openGuard = data.openGuard;
        }
        return row;
      }),
      findAttemptById: jest.fn(async (id: string) => {
        const attempt = attempts.find((row) => row.id === id);
        if (!attempt) return null;
        const request = requests.find((row) => row.id === attempt.requestId);
        return { ...attempt, request };
      }),
      findAttemptByIdempotencyKey: jest.fn(async (key: string) => {
        const attempt = attempts.find((row) => row.idempotencyKey === key);
        if (!attempt) return null;
        const request = requests.find((row) => row.id === attempt.requestId);
        return { ...attempt, request };
      }),
      findAttemptByBankReference: jest.fn(
        async (reference: string, _tx: unknown, excludeId?: string) =>
          (options?.duplicateBankReferences ?? []).find(
            (row) =>
              row.bankTransactionReference === reference && row.id !== excludeId,
          ) ??
          attempts.find(
            (row) =>
              row.bankTransactionReference === reference && row.id !== excludeId,
          ) ??
          null,
      ),
      hasOpenAttempt: jest.fn((rows: Array<{ status: RefundAttemptStatus }>) =>
        rows.some(
          (attempt) =>
            attempt.status === RefundAttemptStatus.SENT ||
            attempt.status === RefundAttemptStatus.UNCONFIRMED,
        ),
      ),
      hasSucceededAttempt: jest.fn((rows: Array<{ status: RefundAttemptStatus }>) =>
        rows.some((attempt) => attempt.status === RefundAttemptStatus.SUCCEEDED),
      ),
      findActor: jest.fn(async (id: string) => {
        if (id === ADMIN_ID) {
          return { id: ADMIN_ID, role: options?.role ?? UserRole.ADMIN };
        }
        if (id === APPROVER_ID) {
          return { id: APPROVER_ID, role: UserRole.ACCOUNTANT };
        }
        return null;
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
      attempts,
      requests,
      payment,
      orderUpdate,
      paymentUpdate,
      ledgerCreate,
      providerRefund,
      queueAdd,
    };
  }

  const completeBody = {
    bankTransactionReference: 'FT26028-001',
    amount: '100000.00',
    currency: RefundCurrency.VND,
    transferredAt: '2026-10-28T02:00:00.000Z',
    destinationHint: 'VCB ****1234 · NGUYEN V*',
  };

  it('1. execute creates exactly one SENT attempt and moves the request to PROCESSING', async () => {
    const { service, repository, attempts, orderUpdate, paymentUpdate, ledgerCreate, queueAdd } =
      harness();
    const result = await service.execute(ADMIN_ID, REQUEST_ID, {
      idempotencyKey: 'exec-1',
    });
    expect(result.status).toBe(RefundRequestStatus.PROCESSING);
    expect(result.attempt?.status).toBe(RefundAttemptStatus.SENT);
    expect(result.attempt?.openGuard).toBe(REQUEST_ID);
    expect(result.attempt?.reconStatus).toBe(RefundReconStatus.PENDING_VERIFY);
    expect(attempts).toHaveLength(1);
    expect(repository.createAttempt).toHaveBeenCalledTimes(1);
    expect(repository.lockPaymentForUpdate).toHaveBeenCalled();
    expect(repository.lockRequestForUpdate).toHaveBeenCalled();
    expect(orderUpdate).not.toHaveBeenCalled();
    expect(paymentUpdate).not.toHaveBeenCalled();
    expect(ledgerCreate).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('2. replay of the same idempotency key does not create a second attempt', async () => {
    const { service, repository, attempts, audit } = harness();
    const first = await service.execute(ADMIN_ID, REQUEST_ID, { idempotencyKey: 'exec-replay' });
    const second = await service.execute(ADMIN_ID, REQUEST_ID, { idempotencyKey: 'exec-replay' });
    expect(second.attempt?.id).toBe(first.attempt?.id);
    expect(second.replayed).toBe(true);
    expect(attempts).toHaveLength(1);
    expect(repository.createAttempt).toHaveBeenCalledTimes(1);
    expect(
      audit.record.mock.calls.filter(
        (call) => call[1] === ADMIN_AUDIT_ACTIONS.REFUND_ATTEMPT_SENT,
      ),
    ).toHaveLength(1);
  });

  it('3. concurrent execute calls cannot open two attempts', async () => {
    const { service, attempts } = harness();
    const [first, second] = await Promise.allSettled([
      service.execute(ADMIN_ID, REQUEST_ID, { idempotencyKey: 'exec-a' }),
      service.execute(ADMIN_ID, REQUEST_ID, { idempotencyKey: 'exec-b' }),
    ]);
    expect(first.status).toBe('fulfilled');
    expect(second.status).toBe('rejected');
    expect(attempts).toHaveLength(1);
  });

  it('4. execute is rejected when the request is not approved', async () => {
    const { service, repository } = harness({
      request: { status: RefundRequestStatus.REQUESTED },
    });
    await expect(
      service.execute(ADMIN_ID, REQUEST_ID, { idempotencyKey: 'exec-unapproved' }),
    ).rejects.toThrow('cannot be executed');
    expect(repository.createAttempt).not.toHaveBeenCalled();
  });

  it('5. execute is rejected without refund.execute', async () => {
    const { service } = harness({ role: UserRole.SUPPORT });
    await expect(
      service.execute(ADMIN_ID, REQUEST_ID, { idempotencyKey: 'exec-support' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('6. eSIM gate without a cleared review blocks execute', async () => {
    const { service, repository } = harness({
      request: { esimGate: RefundEsimGate.ISSUED },
    });
    await expect(
      service.execute(ADMIN_ID, REQUEST_ID, { idempotencyKey: 'exec-esim' }),
    ).rejects.toThrow('eSIM review must be cleared');
    expect(repository.createAttempt).not.toHaveBeenCalled();
  });

  it('7. clear review requires refund.approve and writes a safe audit event', async () => {
    const blocked = harness({
      role: UserRole.SUPPORT,
      request: { esimGate: RefundEsimGate.HAS_REFERENCE },
    });
    await expect(blocked.service.clearEsimReview(ADMIN_ID, REQUEST_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    const { service, audit, requests } = harness({
      request: { esimGate: RefundEsimGate.CREATE_UNCLEAR },
    });
    const cleared = await service.clearEsimReview(APPROVER_ID, REQUEST_ID);
    expect(cleared.esimReviewCleared).toBe(true);
    expect((requests[0].evidence as { esimReviewClearedById?: string }).esimReviewClearedById).toBe(
      APPROVER_ID,
    );
    expect(audit.record).toHaveBeenCalledWith(
      APPROVER_ID,
      ADMIN_AUDIT_ACTIONS.REFUND_ESIM_REVIEW_CLEARED,
      expect.anything(),
      ORDER_ID,
      expect.objectContaining({ esimReviewCleared: true, requestId: REQUEST_ID }),
    );
    const metadata = audit.record.mock.calls[0][4] as Record<string, unknown>;
    expect(refundAuditContainsSensitiveData(metadata)).toBe(false);

    const executed = await service.execute(ADMIN_ID, REQUEST_ID, { idempotencyKey: 'exec-after-clear' });
    expect(executed.attempt?.status).toBe(RefundAttemptStatus.SENT);
  });

  it('8. complete records masked evidence and succeeds the request without verifying recon', async () => {
    const { service, attempts, payment, orderUpdate, paymentUpdate, ledgerCreate, providerRefund } =
      harness();
    const executed = await service.execute(ADMIN_ID, REQUEST_ID, { idempotencyKey: 'exec-complete' });
    const completed = await service.complete(ADMIN_ID, executed.attempt!.id, completeBody);
    expect(completed.attempt?.status).toBe(RefundAttemptStatus.SUCCEEDED);
    expect(completed.attempt?.reconStatus).toBe(RefundReconStatus.PENDING_VERIFY);
    expect(completed.attempt?.openGuard).toBeNull();
    expect(completed.attempt?.destinationHint).toBe('VCB ****1234 · NGUYEN V*');
    expect(completed.status).toBe(RefundRequestStatus.SUCCEEDED);
    expect(completed.paymentUnchanged).toBe(true);
    expect(completed.orderUnchanged).toBe(true);
    expect(payment.status).toBe(PaymentRecordStatus.SUCCESS);
    expect(attempts[0].openGuard).toBeNull();
    expect(orderUpdate).not.toHaveBeenCalled();
    expect(paymentUpdate).not.toHaveBeenCalled();
    expect(ledgerCreate).not.toHaveBeenCalled();
    expect(providerRefund).not.toHaveBeenCalled();
  });

  it('9. duplicate bank transaction references are rejected', async () => {
    const { service } = harness({
      duplicateBankReferences: [
        { id: 'other-att', bankTransactionReference: 'FT26028-001' },
      ],
    });
    const executed = await service.execute(ADMIN_ID, REQUEST_ID, { idempotencyKey: 'exec-dup-bank' });
    await expect(service.complete(ADMIN_ID, executed.attempt!.id, completeBody)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('10. invalid destinationHint is rejected', async () => {
    const { service } = harness();
    const executed = await service.execute(ADMIN_ID, REQUEST_ID, { idempotencyKey: 'exec-hint' });
    await expect(
      service.complete(ADMIN_ID, executed.attempt!.id, {
        ...completeBody,
        destinationHint: 'VCB 123456789',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(executed.attempt?.status).toBe(RefundAttemptStatus.SENT);
  });

  it('11. fail releases the open guard after confirming no transfer', async () => {
    const { service, attempts } = harness();
    const executed = await service.execute(ADMIN_ID, REQUEST_ID, { idempotencyKey: 'exec-fail' });
    const failed = await service.fail(ADMIN_ID, executed.attempt!.id, {
      errorCode: 'OPERATOR_CONFIRMED_NOT_SENT',
    });
    expect(failed.attempt?.status).toBe(RefundAttemptStatus.FAILED);
    expect(failed.attempt?.openGuard).toBeNull();
    expect(attempts[0].openGuard).toBeNull();
    const retry = await service.execute(ADMIN_ID, REQUEST_ID, { idempotencyKey: 'exec-fail-retry' });
    expect(retry.attempt?.status).toBe(RefundAttemptStatus.SENT);
    expect(attempts).toHaveLength(2);
  });

  it('12. unconfirmed keeps reservation and openGuard', async () => {
    const { service, attempts, repository } = harness();
    const executed = await service.execute(ADMIN_ID, REQUEST_ID, { idempotencyKey: 'exec-unc' });
    const unconfirmed = await service.markUnconfirmed(ADMIN_ID, executed.attempt!.id, {
      errorCode: 'STATEMENT_NOT_FOUND',
    });
    expect(unconfirmed.attempt?.status).toBe(RefundAttemptStatus.UNCONFIRMED);
    expect(unconfirmed.attempt?.openGuard).toBe(REQUEST_ID);
    expect(attempts[0].openGuard).toBe(REQUEST_ID);
    await expect(
      service.execute(ADMIN_ID, REQUEST_ID, { idempotencyKey: 'exec-unc-2' }),
    ).rejects.toThrow('SENT or UNCONFIRMED attempt is open');
    expect(repository.createAttempt).toHaveBeenCalledTimes(1);
  });

  it('13. a new attempt cannot be created while one is open', async () => {
    const { service } = harness({
      seedAttempts: [{ id: 'open-1', status: RefundAttemptStatus.SENT, openGuard: REQUEST_ID }],
      request: { status: RefundRequestStatus.PROCESSING },
    });
    await expect(
      service.execute(ADMIN_ID, REQUEST_ID, { idempotencyKey: 'exec-blocked' }),
    ).rejects.toThrow('SENT or UNCONFIRMED attempt is open');
  });

  it('14. payout paths do not mutate payment, order, fulfillment, wallet, or ledger', async () => {
    const { service, payment, orderUpdate, paymentUpdate, ledgerCreate } = harness();
    const executed = await service.execute(ADMIN_ID, REQUEST_ID, { idempotencyKey: 'exec-invariant' });
    await service.complete(ADMIN_ID, executed.attempt!.id, completeBody);
    expect(payment.status).toBe(PaymentRecordStatus.SUCCESS);
    expect(payment.amount.toFixed(2)).toBe('100000.00');
    expect(orderUpdate).not.toHaveBeenCalled();
    expect(paymentUpdate).not.toHaveBeenCalled();
    expect(ledgerCreate).not.toHaveBeenCalled();
  });

  it('15. payout paths never call a provider or enqueue a payout job', async () => {
    const { service, providerRefund, queueAdd, attempts } = harness();
    const executed = await service.execute(ADMIN_ID, REQUEST_ID, { idempotencyKey: 'exec-noprovider' });
    await service.complete(ADMIN_ID, executed.attempt!.id, completeBody);
    expect(providerRefund).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
    expect(attempts[0]).not.toHaveProperty('providerRefundRef', expect.anything());
  });

  it('rejects blocked intended methods and missing idempotency keys', async () => {
    const paypal = harness({
      request: { intendedMethod: RefundIntendedMethod.PAYPAL_REFUND },
    });
    await expect(
      paypal.service.execute(ADMIN_ID, REQUEST_ID, { idempotencyKey: 'exec-paypal' }),
    ).rejects.toThrow('not executable in v1');

    const sepay = harness({
      request: { intendedMethod: RefundIntendedMethod.SEPAY_PG_VOID },
    });
    await expect(
      sepay.service.execute(ADMIN_ID, REQUEST_ID, { idempotencyKey: 'exec-void' }),
    ).rejects.toThrow('not executable in v1');

    const { service } = harness();
    await expect(service.execute(ADMIN_ID, REQUEST_ID, {})).rejects.toThrow(
      'Idempotency-Key header is required',
    );
  });

  it('rejects reusing an idempotency key on a different request or payload', async () => {
    const { service } = harness();
    await service.execute(ADMIN_ID, REQUEST_ID, {
      idempotencyKey: 'shared-key',
      amount: '100000.00',
    });
    await expect(
      service.execute(ADMIN_ID, OTHER_REQUEST_ID, { idempotencyKey: 'shared-key' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects failing an attempt that already has transfer evidence', async () => {
    const { service } = harness({
      request: { status: RefundRequestStatus.PROCESSING },
      seedAttempts: [
        {
          id: 'done-1',
          status: RefundAttemptStatus.SUCCEEDED,
          bankTransactionReference: 'FT-DONE',
          transferredAt: new Date(),
          openGuard: null,
        },
      ],
    });
    await expect(
      service.fail(ADMIN_ID, 'done-1', { errorCode: 'TRANSFER_NOT_SENT' }),
    ).rejects.toThrow('successful transfer evidence');
  });

  it('rejects cancel after a SUCCEEDED attempt so history cannot be erased', async () => {
    const { service } = harness({
      request: { status: RefundRequestStatus.PROCESSING },
      seedAttempts: [
        {
          id: 'ok-1',
          status: RefundAttemptStatus.SUCCEEDED,
          bankTransactionReference: 'FT-OK',
          transferredAt: new Date(),
          openGuard: null,
        },
      ],
    });
    await expect(service.cancel(APPROVER_ID, REQUEST_ID)).rejects.toThrow(
      'SUCCEEDED attempt',
    );
  });
});
