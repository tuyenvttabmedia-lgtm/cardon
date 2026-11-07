import {
  RefundAttemptStatus,
  RefundEsimGate,
  RefundReconStatus,
  RefundRequestStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  buildRefundListWhere,
  isExactRefundId,
  mapRefundDetail,
  mapRefundListItem,
  refundAdminPayloadContainsSensitiveData,
  refundAdminWarnings,
  refundNeedsAction,
} from './refund-admin-read';

const REQUEST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORDER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PAYMENT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ATTEMPT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

describe('refund admin read mapper', () => {
  it('accepts exact UUID search only', () => {
    expect(isExactRefundId(REQUEST_ID)).toBe(true);
    expect(isExactRefundId('not-an-id')).toBe(false);
    expect(buildRefundListWhere({ q: 'PIN-1234' })).toEqual({ id: { in: [] } });
    const where = buildRefundListWhere({ q: REQUEST_ID });
    expect(JSON.stringify(where)).toContain(REQUEST_ID);
    expect(JSON.stringify(where)).not.toMatch(/reason/i);
  });

  it('paginates needsAction from request and attempt statuses', () => {
    const where = buildRefundListWhere({ needsAction: true });
    expect(JSON.stringify(where)).toContain('REQUESTED');
    expect(JSON.stringify(where)).toContain('UNCONFIRMED');
    expect(JSON.stringify(where)).toContain('PENDING_VERIFY');
  });

  it('does not treat SUCCEEDED+VERIFIED as needsAction', () => {
    expect(
      refundNeedsAction({
        status: RefundRequestStatus.SUCCEEDED,
        attempts: [
          {
            status: RefundAttemptStatus.SUCCEEDED,
            reconStatus: RefundReconStatus.VERIFIED,
          },
        ],
      }),
    ).toBe(false);
    expect(
      refundNeedsAction({
        status: RefundRequestStatus.SUCCEEDED,
        attempts: [
          {
            status: RefundAttemptStatus.SUCCEEDED,
            reconStatus: RefundReconStatus.PENDING_VERIFY,
          },
        ],
      }),
    ).toBe(true);
  });

  it('keeps payout recorded distinct from recon verified', () => {
    const item = mapRefundListItem({
      id: REQUEST_ID,
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      amount: new Decimal('100000.00'),
      currency: 'VND',
      status: RefundRequestStatus.SUCCEEDED,
      intendedMethod: 'BANK_PAYOUT',
      esimGate: RefundEsimGate.NONE,
      createdAt: new Date('2026-10-01T00:00:00Z'),
      updatedAt: new Date('2026-10-01T00:00:00Z'),
      requestedBy: { id: 'staff-1', email: 'ops@cardon.vn' },
      attempts: [
        {
          id: ATTEMPT_ID,
          status: RefundAttemptStatus.SUCCEEDED,
          reconStatus: RefundReconStatus.PENDING_VERIFY,
          amount: new Decimal('100000.00'),
          currency: 'VND',
          method: 'BANK_PAYOUT',
          createdAt: new Date('2026-10-01T01:00:00Z'),
          updatedAt: new Date('2026-10-01T01:00:00Z'),
        },
      ],
    });
    expect(item.payoutRecorded).toBe(true);
    expect(item.reconVerified).toBe(false);
    expect(item.latestAttemptStatus).toBe('SUCCEEDED');
    expect(item.latestReconStatus).toBe('PENDING_VERIFY');
  });

  it('strips evidence, provider payloads and secrets from detail', () => {
    const detail = mapRefundDetail({
      request: {
        id: REQUEST_ID,
        orderId: ORDER_ID,
        paymentId: PAYMENT_ID,
        amount: new Decimal('50000.00'),
        currency: 'VND',
        reason: 'Khách hủy đơn',
        status: RefundRequestStatus.PROCESSING,
        intendedMethod: 'BANK_PAYOUT',
        esimGate: RefundEsimGate.ISSUED,
        evidence: {
          esimReviewCleared: false,
          lpa: 'LPA:1$smdp.example$TOKEN',
          pin: '1234',
          rawStatement: 'account 0123456789012',
        },
        createdAt: new Date('2026-10-01T00:00:00Z'),
        updatedAt: new Date('2026-10-01T00:00:00Z'),
        requestedBy: { id: 'staff-1', email: 'ops@cardon.vn' },
        attempts: [
          {
            id: ATTEMPT_ID,
            status: RefundAttemptStatus.UNCONFIRMED,
            reconStatus: RefundReconStatus.PENDING_VERIFY,
            amount: new Decimal('50000.00'),
            currency: 'VND',
            method: 'BANK_PAYOUT',
            destinationHint: 'VCB ****1234',
            bankTransactionReference: 'FT123',
            createdAt: new Date('2026-10-01T01:00:00Z'),
            updatedAt: new Date('2026-10-01T01:00:00Z'),
            executedBy: { id: 'staff-2', email: 'acc@cardon.vn' },
          },
        ],
      },
      order: {
        id: ORDER_ID,
        orderCode: 'CD-1',
        paymentStatus: 'PAID',
        fulfillmentStatus: 'COMPLETED',
        totalAmount: new Decimal('50000.00'),
      },
      payment: {
        id: PAYMENT_ID,
        amount: new Decimal('100000.00'),
        status: 'SUCCESS',
        gateway: 'SEPAY',
        paymentReference: 'pay-1',
        createdAt: new Date('2026-10-01T00:00:00Z'),
      },
      siblings: [
        {
          amount: new Decimal('50000.00'),
          status: 'PROCESSING',
          attempts: [{ amount: new Decimal('50000.00'), status: 'UNCONFIRMED' }],
        },
      ],
      auditEvents: [
        {
          id: 'audit-1',
          action: 'REFUND_ATTEMPT_UNCONFIRMED',
          createdAt: new Date('2026-10-01T01:00:00Z'),
          adminId: 'staff-2',
          metadata: {
            requestId: REQUEST_ID,
            lpa: 'secret',
            pin: '9999',
            gatewayResponse: { raw: true },
            errorCode: 'CONNECTION_LOST',
          },
        },
        {
          id: 'audit-2',
          action: 'ESIM_LPA_REVEALED',
          createdAt: new Date('2026-10-01T01:01:00Z'),
          adminId: 'staff-2',
          metadata: { lpa: 'should-drop' },
        },
      ],
    });

    expect(detail.esimReview).toEqual({
      esimReviewCleared: false,
      esimReviewClearedAt: null,
      esimReviewClearedById: null,
    });
    expect(JSON.stringify(detail)).not.toMatch(/LPA:1/);
    expect(JSON.stringify(detail)).not.toMatch(/rawStatement/);
    expect(JSON.stringify(detail)).not.toMatch(/gatewayResponse/);
    expect(JSON.stringify(detail.auditEvents)).not.toContain('ESIM_LPA_REVEALED');
    expect(detail.auditEvents[0].metadata).toEqual({
      requestId: REQUEST_ID,
      errorCode: 'CONNECTION_LOST',
    });
    expect(detail.attempts[0].destinationHint).toBe('VCB ****1234');
    expect(detail.attempts[0]).not.toHaveProperty('safeRequestMeta');
    expect(detail.attempts[0]).not.toHaveProperty('errorMessage');
    expect(detail.warnings).toEqual(
      expect.arrayContaining(['ISSUED', 'UNCONFIRMED', 'PARTIAL']),
    );
    expect(refundAdminPayloadContainsSensitiveData(detail)).toBe(false);
  });

  it('emits eSIM and unconfirmed warnings', () => {
    expect(
      refundAdminWarnings({
        status: RefundRequestStatus.MANUAL_REVIEW,
        esimGate: RefundEsimGate.CREATE_UNCLEAR,
        requestAmount: '100',
        paymentAmount: '100',
        attempts: [{ status: RefundAttemptStatus.UNCONFIRMED, amount: '100' }],
      }),
    ).toEqual(['CREATE_UNCLEAR', 'UNCONFIRMED', 'MANUAL_REVIEW']);
  });
});
