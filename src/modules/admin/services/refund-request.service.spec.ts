import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  PaymentGatewayCode,
  PaymentRecordStatus,
  ProductVariantType,
  RefundAttemptStatus,
  RefundCurrency,
  RefundEsimGate,
  RefundIntendedMethod,
  RefundRequestStatus,
  UserRole,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { refundAuditContainsSensitiveData } from '../entities/refund-audit';
import { ADMIN_AUDIT_ACTIONS } from '../entities/admin.constants';
import { RefundRequestService } from './refund-request.service';

describe('REFUND-03 RefundRequestService', () => {
  const ORDER_ID = '11111111-1111-4111-8111-111111111111';
  const PAYMENT_ID = '22222222-2222-4222-8222-222222222222';
  const OTHER_PAYMENT_ID = '33333333-3333-4333-8333-333333333333';
  const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const APPROVER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  function harness(options?: {
    role?: UserRole;
    approverRole?: UserRole;
    payment?: Partial<{
      id: string;
      orderId: string;
      amount: Decimal;
      status: PaymentRecordStatus;
      gateway: PaymentGatewayCode;
    }>;
    esim?: {
      hasProfile?: boolean;
      hasLpaRevealAudit?: boolean;
      attempts?: Array<{
        operation: string;
        outcome: string;
        providerReference?: string | null;
        openGuard?: string | null;
      }>;
    };
    seedRequests?: Array<{
      id: string;
      amount: Decimal;
      status: RefundRequestStatus;
      requestedById: string;
      attempts: Array<{ amount: Decimal; status: RefundAttemptStatus }>;
    }>;
  }) {
    const payment = {
      id: PAYMENT_ID,
      orderId: ORDER_ID,
      amount: new Decimal('181000.00'),
      status: PaymentRecordStatus.SUCCESS,
      gateway: PaymentGatewayCode.SEPAY,
      ...options?.payment,
    };
    const requests = [...(options?.seedRequests ?? [])].map((row) => ({
      ...row,
      orderId: ORDER_ID,
      paymentId: payment.id,
      currency: RefundCurrency.VND,
      intendedMethod: RefundIntendedMethod.BANK_PAYOUT,
      esimGate: RefundEsimGate.NONE,
      reason: 'seeded',
    }));

    const orderUpdate = jest.fn();
    const paymentUpdate = jest.fn();
    const attemptCreate = jest.fn();
    const ledgerCreate = jest.fn();
    const audit = { record: jest.fn() };
    let queue = Promise.resolve();

    const rbac = {
      roleHasPermission: jest.fn(async (_role: UserRole, permission: string) => {
        if (permission === 'refund.request') {
          return ['SUPPORT', 'ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'].includes(
            _role,
          );
        }
        if (permission === 'refund.approve') {
          return ['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'].includes(_role);
        }
        return false;
      }),
    };

    const repository = {
      runTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const run = queue.then(() => fn({}));
        queue = run.then(
          () => undefined,
          () => undefined,
        );
        return run;
      }),
      lockPaymentForUpdate: jest.fn(async () => [{ id: payment.id }]),
      findPaymentById: jest.fn(async (id: string) =>
        id === payment.id
          ? payment
          : id === OTHER_PAYMENT_ID
            ? { ...payment, id: OTHER_PAYMENT_ID, orderId: 'other-order' }
            : null,
      ),
      listRequestsForPayment: jest.fn(async () => requests),
      findOrderHeader: jest.fn(async (orderId: string) =>
        orderId === ORDER_ID
          ? {
              id: ORDER_ID,
              fulfillmentStatus: 'NEED_MANUAL_REVIEW',
              paymentStatus: 'PAID',
            }
          : null,
      ),
      listSuccessPaymentsForOrder: jest.fn(async () => [payment]),
      createRequest: jest.fn(async (data: Record<string, unknown>) => {
        const created = {
          id: `req-${requests.length + 1}`,
          status: RefundRequestStatus.REQUESTED,
          ...data,
        };
        requests.push({ ...created, attempts: [] } as never);
        return created;
      }),
      findRequestById: jest.fn(async (id: string) =>
        requests.find((row) => row.id === id) ?? null,
      ),
      updateRequest: jest.fn(async (id: string, data: Record<string, unknown>) => {
        const row = requests.find((item) => item.id === id);
        if (!row) return null;
        Object.assign(row, {
          status: data.status ?? row.status,
          approvedById: data.approvedBy ? APPROVER_ID : row.requestedById,
          cancelledById: data.cancelledBy ? ADMIN_ID : undefined,
        });
        return row;
      }),
      loadEsimGateSources: jest.fn(async () => ({
        hasLpaRevealAudit: options?.esim?.hasLpaRevealAudit === true,
        items: [
          {
            variant: { type: ProductVariantType.ESIM },
            esimProfile: options?.esim?.hasProfile ? { id: 'profile-1' } : null,
            esimAttempts: options?.esim?.attempts ?? [],
          },
        ],
      })),
      findActor: jest.fn(async (id: string) => {
        if (id === ADMIN_ID) {
          return { id: ADMIN_ID, role: options?.role ?? UserRole.ADMIN };
        }
        if (id === APPROVER_ID) {
          return { id: APPROVER_ID, role: options?.approverRole ?? UserRole.ACCOUNTANT };
        }
        return null;
      }),
      hasOpenAttempt: jest.fn((attempts: Array<{ status: RefundAttemptStatus }>) =>
        attempts.some(
          (attempt) =>
            attempt.status === RefundAttemptStatus.SENT ||
            attempt.status === RefundAttemptStatus.UNCONFIRMED,
        ),
      ),
      hasSucceededAttempt: jest.fn((attempts: Array<{ status: RefundAttemptStatus }>) =>
        attempts.some((attempt) => attempt.status === RefundAttemptStatus.SUCCEEDED),
      ),
    };

    const service = new RefundRequestService(
      repository as never,
      rbac as never,
      audit as never,
    );

    return {
      service,
      repository,
      rbac,
      audit,
      requests,
      payment,
      orderUpdate,
      paymentUpdate,
      attemptCreate,
      ledgerCreate,
    };
  }

  it('1. creates a REQUESTED refund for a SUCCESS payment', async () => {
    const { service, repository, audit, orderUpdate, paymentUpdate } = harness();
    const result = await service.createForOrder(ADMIN_ID, ORDER_ID, {
      paymentId: PAYMENT_ID,
      amount: '181000',
      reason: 'Customer requested refund',
    });

    expect(result.status).toBe(RefundRequestStatus.REQUESTED);
    expect(result.amount).toBe('181000.00');
    expect(result.currency).toBe(RefundCurrency.VND);
    expect(result.intendedMethod).toBe(RefundIntendedMethod.BANK_PAYOUT);
    expect(result.fulfillmentUnchanged).toBe(true);
    expect(repository.lockPaymentForUpdate).toHaveBeenCalledWith(PAYMENT_ID, {});
    expect(repository.createRequest).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      ADMIN_ID,
      ADMIN_AUDIT_ACTIONS.REFUND_REQUEST_CREATED,
      expect.anything(),
      ORDER_ID,
      expect.objectContaining({ requestId: result.id, amount: '181000.00' }),
    );
    expect(orderUpdate).not.toHaveBeenCalled();
    expect(paymentUpdate).not.toHaveBeenCalled();
  });

  it('2. rejects a payment that does not belong to the order', async () => {
    const { service, repository } = harness();
    await expect(
      service.createForOrder(ADMIN_ID, ORDER_ID, {
        paymentId: OTHER_PAYMENT_ID,
        amount: '1000',
        reason: 'Wrong payment',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.createRequest).not.toHaveBeenCalled();
  });

  it('3. rejects a payment that is not SUCCESS', async () => {
    const { service, repository } = harness({
      payment: { status: PaymentRecordStatus.PENDING },
    });
    await expect(
      service.createForOrder(ADMIN_ID, ORDER_ID, {
        paymentId: PAYMENT_ID,
        amount: '1000',
        reason: 'Unpaid',
      }),
    ).rejects.toThrow('Only SUCCESS payments can be refunded');
    expect(repository.createRequest).not.toHaveBeenCalled();
  });

  it('4. rejects zero, negative, and over-cap amounts', async () => {
    const { service } = harness();
    await expect(
      service.createForOrder(ADMIN_ID, ORDER_ID, {
        paymentId: PAYMENT_ID,
        amount: '0',
        reason: 'Zero',
      }),
    ).rejects.toThrow('greater than 0');
    await expect(
      service.createForOrder(ADMIN_ID, ORDER_ID, {
        paymentId: PAYMENT_ID,
        amount: '-10',
        reason: 'Negative',
      }),
    ).rejects.toThrow('greater than 0');
    await expect(
      service.createForOrder(ADMIN_ID, ORDER_ID, {
        paymentId: PAYMENT_ID,
        amount: '181000.01',
        reason: 'Over cap',
      }),
    ).rejects.toThrow('exceeds remaining refundable balance');
  });

  it('5. rejects a currency that does not match the payment', async () => {
    const { service } = harness();
    await expect(
      service.createForOrder(ADMIN_ID, ORDER_ID, {
        paymentId: PAYMENT_ID,
        amount: '1000',
        currency: RefundCurrency.USD,
        reason: 'Wrong currency',
      }),
    ).rejects.toThrow('does not match payment currency');
  });

  it('6. serializes concurrent creates so they cannot exceed the collected amount', async () => {
    const { service, requests } = harness();
    const [first, second] = await Promise.allSettled([
      service.createForOrder(ADMIN_ID, ORDER_ID, {
        paymentId: PAYMENT_ID,
        amount: '181000',
        reason: 'First concurrent',
      }),
      service.createForOrder(ADMIN_ID, ORDER_ID, {
        paymentId: PAYMENT_ID,
        amount: '181000',
        reason: 'Second concurrent',
      }),
    ]);
    expect(first.status).toBe('fulfilled');
    expect(second.status).toBe('rejected');
    expect(requests).toHaveLength(1);
  });

  it('7. keeps UNCONFIRMED attempts inside the reservation', async () => {
    const { service, repository } = harness({
      seedRequests: [
        {
          id: 'open-1',
          amount: new Decimal('181000.00'),
          status: RefundRequestStatus.PROCESSING,
          requestedById: ADMIN_ID,
          attempts: [
            { amount: new Decimal('181000.00'), status: RefundAttemptStatus.UNCONFIRMED },
          ],
        },
      ],
    });
    await expect(
      service.createForOrder(ADMIN_ID, ORDER_ID, {
        paymentId: PAYMENT_ID,
        amount: '1',
        reason: 'Should not fit',
      }),
    ).rejects.toThrow('exceeds remaining refundable balance');
    expect(repository.createRequest).not.toHaveBeenCalled();
  });

  it('8. enforces maker-checker except for SUPER_ADMIN', async () => {
    const sameAdmin = harness({
      seedRequests: [
        {
          id: 'req-self',
          amount: new Decimal('1000.00'),
          status: RefundRequestStatus.REQUESTED,
          requestedById: ADMIN_ID,
          attempts: [],
        },
      ],
    });
    await expect(sameAdmin.service.approve(ADMIN_ID, 'req-self')).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    const superAdmin = harness({
      role: UserRole.SUPER_ADMIN,
      seedRequests: [
        {
          id: 'req-self',
          amount: new Decimal('1000.00'),
          status: RefundRequestStatus.REQUESTED,
          requestedById: ADMIN_ID,
          attempts: [],
        },
      ],
    });
    const approvedByOwner = await superAdmin.service.approve(ADMIN_ID, 'req-self');
    expect(approvedByOwner.status).toBe(RefundRequestStatus.APPROVED);

    const support = harness({ role: UserRole.SUPPORT });
    await expect(support.service.approve(ADMIN_ID, 'req-self')).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    const twoPerson = harness({
      seedRequests: [
        {
          id: 'req-other',
          amount: new Decimal('1000.00'),
          status: RefundRequestStatus.REQUESTED,
          requestedById: ADMIN_ID,
          attempts: [],
        },
      ],
    });
    const approved = await twoPerson.service.approve(APPROVER_ID, 'req-other');
    expect(approved.status).toBe(RefundRequestStatus.APPROVED);
  });

  it('9. rejects cancel when an open attempt exists', async () => {
    const { service } = harness({
      seedRequests: [
        {
          id: 'req-open',
          amount: new Decimal('181000.00'),
          status: RefundRequestStatus.APPROVED,
          requestedById: ADMIN_ID,
          attempts: [{ amount: new Decimal('181000.00'), status: RefundAttemptStatus.SENT }],
        },
      ],
    });
    await expect(service.cancel(APPROVER_ID, 'req-open')).rejects.toThrow(
      'open SENT or UNCONFIRMED attempt',
    );
  });

  it('10. stores eSIM gates using ISSUED > HAS_REFERENCE > CREATE_UNCLEAR > NONE', async () => {
    const issued = harness({
      esim: { hasProfile: true, attempts: [{ operation: 'CREATE', outcome: 'UNCONFIRMED' }] },
    });
    const issuedResult = await issued.service.createForOrder(ADMIN_ID, ORDER_ID, {
      paymentId: PAYMENT_ID,
      amount: '1000',
      reason: 'Issued profile',
    });
    expect(issuedResult.esimGate).toBe(RefundEsimGate.ISSUED);
    expect(issuedResult.requiresManualReview).toBe(true);

    const reference = harness({
      esim: {
        attempts: [
          {
            operation: 'CREATE',
            outcome: 'CONFIRMED_CREATED',
            providerReference: '104158',
          },
        ],
      },
    });
    const referenceResult = await reference.service.createForOrder(ADMIN_ID, ORDER_ID, {
      paymentId: PAYMENT_ID,
      amount: '1000',
      reason: 'Has reference',
    });
    expect(referenceResult.esimGate).toBe(RefundEsimGate.HAS_REFERENCE);

    const unclear = harness({
      esim: {
        attempts: [
          { operation: 'CREATE', outcome: 'UNCONFIRMED', openGuard: 'item-1' },
        ],
      },
    });
    const unclearResult = await unclear.service.createForOrder(ADMIN_ID, ORDER_ID, {
      paymentId: PAYMENT_ID,
      amount: '1000',
      reason: 'Create unclear',
    });
    expect(unclearResult.esimGate).toBe(RefundEsimGate.CREATE_UNCLEAR);
  });

  it('11. does not mutate payment, order, fulfillment, wallet, ledger, or attempts', async () => {
    const { service, repository, orderUpdate, paymentUpdate, attemptCreate, ledgerCreate } =
      harness();
    await service.createForOrder(ADMIN_ID, ORDER_ID, {
      paymentId: PAYMENT_ID,
      amount: '5000',
      reason: 'No side effects',
    });
    expect(repository.createRequest).toHaveBeenCalled();
    expect(orderUpdate).not.toHaveBeenCalled();
    expect(paymentUpdate).not.toHaveBeenCalled();
    expect(attemptCreate).not.toHaveBeenCalled();
    expect(ledgerCreate).not.toHaveBeenCalled();
    expect(repository.updateRequest).not.toHaveBeenCalled();
  });

  it('12. writes audit metadata without secrets or provider payloads', async () => {
    const { service, audit } = harness();
    await service.createForOrder(ADMIN_ID, ORDER_ID, {
      paymentId: PAYMENT_ID,
      amount: '5000',
      reason: 'Safe audit',
    });
    const metadata = audit.record.mock.calls[0][4] as Record<string, unknown>;
    expect(refundAuditContainsSensitiveData(metadata)).toBe(false);
    expect(metadata).not.toHaveProperty('reason');
    expect(metadata).not.toHaveProperty('gatewayResponse');
    expect(JSON.stringify(metadata)).not.toMatch(/pin|lpa|secret|password/i);
  });

  it('keeps remaining hold after a partial SUCCEEDED attempt', async () => {
    const { service, repository } = harness({
      seedRequests: [
        {
          id: 'partial',
          amount: new Decimal('100000.00'),
          status: RefundRequestStatus.PROCESSING,
          requestedById: ADMIN_ID,
          attempts: [{ amount: new Decimal('40000.00'), status: RefundAttemptStatus.SUCCEEDED }],
        },
      ],
    });
    await expect(
      service.createForOrder(ADMIN_ID, ORDER_ID, {
        paymentId: PAYMENT_ID,
        amount: '81001',
        reason: 'Too much after partial',
      }),
    ).rejects.toThrow('exceeds remaining refundable balance');
    const ok = await service.createForOrder(ADMIN_ID, ORDER_ID, {
      paymentId: PAYMENT_ID,
      amount: '81000',
      reason: 'Fits after partial',
    });
    expect(ok.status).toBe(RefundRequestStatus.REQUESTED);
    expect(repository.createRequest).toHaveBeenCalledTimes(1);
  });
});
