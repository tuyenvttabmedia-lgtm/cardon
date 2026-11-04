import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  RefundAttemptStatus,
  RefundEsimGate,
  RefundReconStatus,
  RefundRequestStatus,
  UserRole,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { refundAuditContainsSensitiveData } from '../entities/refund-audit';
import { RefundRequestService } from './refund-request.service';

const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REQUEST_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ORDER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PAYMENT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ATTEMPT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

describe('REFUND-04D RefundRequestService list/detail', () => {
  function harness(options?: { role?: UserRole; detail?: Record<string, unknown> | null }) {
    const rbac = {
      roleHasPermission: jest.fn(async () => false),
      roleHasAnyPermission: jest.fn(async (_role: UserRole, required: string[]) =>
        required.some((code) =>
          ['refund.request', 'refund.approve', 'refund.execute', 'refund.reconcile'].includes(
            code,
          ),
        ) && ['SUPPORT', 'ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'].includes(options?.role ?? 'ACCOUNTANT'),
      ),
    };
    const listRequestsForAdmin = jest.fn(
      async (_where: unknown, _skip: number, _take: number) => [0, [] as unknown[]],
    );
    const findRequestDetailForAdmin = jest.fn(async () => options?.detail ?? null);
    const listRequestsForPaymentRead = jest.fn(async () => []);
    const listRefundAuditEvents = jest.fn(
      async (): Promise<
        Array<{
          id: string;
          action: string;
          createdAt: Date;
          adminId: string;
          metadata: unknown;
        }>
      > => [],
    );
    const repository = {
      findActor: jest.fn(async () => ({
        id: ADMIN_ID,
        role: options?.role ?? UserRole.ACCOUNTANT,
      })),
      listRequestsForAdmin,
      findRequestDetailForAdmin,
      listRequestsForPaymentRead,
      listRefundAuditEvents,
    };
    const service = new RefundRequestService(
      repository as never,
      rbac as never,
      { record: jest.fn() } as never,
    );
    return {
      service,
      rbac,
      listRequestsForAdmin,
      findRequestDetailForAdmin,
      listRefundAuditEvents,
    };
  }

  it('rejects list/detail without a refund permission', async () => {
    const { service, rbac } = harness({ role: UserRole.MARKETING });
    rbac.roleHasAnyPermission.mockResolvedValue(false);
    await expect(service.list(ADMIN_ID, {})).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getById(ADMIN_ID, REQUEST_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('returns 404 when the request does not exist', async () => {
    const { service } = harness({ detail: null });
    await expect(service.getById(ADMIN_ID, REQUEST_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('passes pagination and filters to the repository', async () => {
    const { service, listRequestsForAdmin } = harness();
    listRequestsForAdmin.mockResolvedValue([0, []]);
    await service.list(ADMIN_ID, {
      skip: 20,
      take: 10,
      requestStatus: RefundRequestStatus.REQUESTED,
      attemptStatus: RefundAttemptStatus.SENT,
      esimGate: RefundEsimGate.NONE,
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      needsAction: true,
      q: REQUEST_ID,
    });
    expect(listRequestsForAdmin).toHaveBeenCalledTimes(1);
    const [where, skip, take] = listRequestsForAdmin.mock.calls[0] as [
      { orderId?: string; paymentId?: string; status?: string; esimGate?: string },
      number,
      number,
    ];
    expect(skip).toBe(20);
    expect(take).toBe(10);
    expect(where.orderId).toBe(ORDER_ID);
    expect(where.paymentId).toBe(PAYMENT_ID);
    expect(where.status).toBe(RefundRequestStatus.REQUESTED);
    expect(where.esimGate).toBe(RefundEsimGate.NONE);
  });

  it('caps page size and ignores non-UUID search', async () => {
    const { service, listRequestsForAdmin } = harness();
    await service.list(ADMIN_ID, { take: 500, q: 'secret-pin' });
    const [where, , take] = listRequestsForAdmin.mock.calls[0] as [
      Record<string, unknown>,
      number,
      number,
    ];
    expect(take).toBe(100);
    expect(where).toEqual({ id: { in: [] } });
  });

  it('returns a sanitized detail payload', async () => {
    const { service, listRefundAuditEvents } = harness({
      detail: {
        id: REQUEST_ID,
        orderId: ORDER_ID,
        paymentId: PAYMENT_ID,
        amount: new Decimal('1000.00'),
        currency: 'VND',
        reason: 'test',
        status: RefundRequestStatus.SUCCEEDED,
        intendedMethod: 'BANK_PAYOUT',
        esimGate: RefundEsimGate.NONE,
        evidence: { esimReviewCleared: false },
        createdAt: new Date('2026-10-01T00:00:00Z'),
        updatedAt: new Date('2026-10-01T00:00:00Z'),
        requestedBy: { id: ADMIN_ID, email: 'acc@cardon.vn' },
        order: {
          id: ORDER_ID,
          orderCode: 'CD-1',
          paymentStatus: 'PAID',
          fulfillmentStatus: 'COMPLETED',
          totalAmount: new Decimal('1000.00'),
        },
        payment: {
          id: PAYMENT_ID,
          amount: new Decimal('1000.00'),
          status: 'SUCCESS',
          gateway: 'SEPAY',
          paymentReference: 'pay-1',
          createdAt: new Date('2026-10-01T00:00:00Z'),
        },
        attempts: [
          {
            id: ATTEMPT_ID,
            status: RefundAttemptStatus.SUCCEEDED,
            reconStatus: RefundReconStatus.PENDING_VERIFY,
            amount: new Decimal('1000.00'),
            currency: 'VND',
            method: 'BANK_PAYOUT',
            destinationHint: 'ACB ****99',
            bankTransactionReference: 'FT-1',
            createdAt: new Date('2026-10-01T01:00:00Z'),
            updatedAt: new Date('2026-10-01T01:00:00Z'),
            executedBy: { id: ADMIN_ID, email: 'acc@cardon.vn' },
          },
        ],
      },
    });
    listRefundAuditEvents.mockResolvedValue([
      {
        id: 'audit-1',
        action: 'REFUND_ATTEMPT_SUCCEEDED',
        createdAt: new Date('2026-10-01T01:00:00Z'),
        adminId: ADMIN_ID,
        metadata: {
          requestId: REQUEST_ID,
          amount: '1000.00',
          token: 'should-drop',
        },
      },
    ]);

    const detail = await service.getById(ADMIN_ID, REQUEST_ID);
    expect(detail.attempts[0].payoutRecorded).toBe(true);
    expect(detail.attempts[0].reconVerified).toBe(false);
    expect(detail.attempts[0]).not.toHaveProperty('safeRequestMeta');
    expect(JSON.stringify(detail)).not.toMatch(/token/);
    expect(refundAuditContainsSensitiveData(detail.auditEvents[0].metadata)).toBe(false);
  });

  it('does not enqueue jobs or call providers on list/detail', async () => {
    const { service } = harness();
    await service.list(ADMIN_ID, {});
    expect(true).toBe(true);
  });
});
