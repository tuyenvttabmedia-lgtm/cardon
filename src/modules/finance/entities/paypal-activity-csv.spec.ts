import { PaypalReportLineKind } from '@prisma/client';
import {
  classifyPaypalActivityRow,
  parsePaypalActivityCsv,
  parsePaypalMoney,
  sha256Hex,
} from './paypal-activity-csv';
import {
  buildPaypalFeeMatchDrafts,
  validateFeeNetConsistency,
} from './paypal-fee-match.engine';
import { PaypalFeeMatchStatus } from '@prisma/client';

/**
 * Synthetic Activity Download–shaped CSV for unit tests only.
 * NOT a KEYON production sample — header map remains provisional.
 */
const SYNTHETIC_ACTIVITY_CSV = `Date,Time,TimeZone,Type,Status,Currency,Gross,Fee,Net,Transaction ID,Reference Txn ID,Invoice Number,Custom Number,Balance Impact,Transaction Event Code
11/06/2026,17:29:25,GMT,PayPal Checkout Payment,Completed,USD,6.55,-0.33,6.22,0EB56821XA562691D,,,"PAY-F3104AC090934086A46A",Credit,T0006
11/07/2026,08:46:58,GMT,PayPal Checkout Payment,Completed,USD,3.96,-0.20,3.76,6GK65584H96475314,,,"PAY-1B83EE7B09F84AC3AA58",Credit,T0006
11/07/2026,09:00:00,GMT,Payment Refund,Completed,USD,-3.96,0.00,-3.96,REFUNDTXN001,6GK65584H96475314,,,"PAY-1B83EE7B09F84AC3AA58",Debit,T1107
11/07/2026,10:00:00,GMT,General Withdrawal,Completed,USD,-100.00,0.00,-100.00,WITHDRAW001,,,,Debit,T0400
`;

describe('paypal-activity-csv (provisional headers)', () => {
  it('parses synthetic Activity Download columns', () => {
    const result = parsePaypalActivityCsv(SYNTHETIC_ACTIVITY_CSV);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.headerProvisional).toBe(true);
    expect(result.rows).toHaveLength(4);
    expect(result.rows[0].paypalTxnId).toBe('0EB56821XA562691D');
    expect(result.rows[0].customId).toBe('PAY-F3104AC090934086A46A');
    expect(result.rows[0].kind).toBe(PaypalReportLineKind.SALE_CAPTURE);
    expect(result.rows[0].fee).toBe('0.33');
    expect(result.rows[2].kind).toBe(PaypalReportLineKind.REFUND);
    expect(result.rows[3].kind).toBe(PaypalReportLineKind.PAYOUT_OR_BALANCE);
  });

  it('rejects invalid headers', () => {
    const result = parsePaypalActivityCsv('Foo,Bar\n1,2\n');
    expect(result.ok).toBe(false);
  });

  it('detects duplicate Transaction IDs', () => {
    const csv = `Date,Time,TimeZone,Type,Status,Currency,Gross,Fee,Net,Transaction ID,Custom Number,Balance Impact
11/06/2026,00:00:00,GMT,Payment,Completed,USD,1.00,-0.10,0.90,DUP1,PAY-A,Credit
11/06/2026,00:01:00,GMT,Payment,Completed,USD,1.00,-0.10,0.90,DUP1,PAY-B,Credit
`;
    const result = parsePaypalActivityCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.duplicateTxnIds).toContain('DUP1');
  });

  it('hashes idempotently', () => {
    const a = sha256Hex(Buffer.from(SYNTHETIC_ACTIVITY_CSV));
    const b = sha256Hex(Buffer.from(SYNTHETIC_ACTIVITY_CSV));
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('parses money with parentheses and commas', () => {
    expect(parsePaypalMoney('(1.25)')).toBe('1.25');
    expect(parsePaypalMoney('-0.33')).toBe('0.33');
    expect(parsePaypalMoney('1,234.50')).toBe('1234.50');
  });
});

describe('classifyPaypalActivityRow', () => {
  it('classifies refund / payout / sale', () => {
    expect(
      classifyPaypalActivityRow({
        typeRaw: 'Payment Refund',
        statusRaw: 'Completed',
        balanceImpact: 'Debit',
        txnEventCode: 'T1107',
      }),
    ).toBe(PaypalReportLineKind.REFUND);
    expect(
      classifyPaypalActivityRow({
        typeRaw: 'General Withdrawal',
        statusRaw: 'Completed',
        balanceImpact: 'Debit',
        txnEventCode: 'T0400',
      }),
    ).toBe(PaypalReportLineKind.PAYOUT_OR_BALANCE);
  });
});

describe('paypal-fee-match.engine', () => {
  const payments = [
    {
      id: 'pay-1',
      paymentReference: 'PAY-F3104AC090934086A46A',
      gatewayTransactionId: '0EB56821XA562691D',
      amount: '6.55',
      currency: 'USD',
      feeEstimated: '0.00',
      paidAt: new Date('2026-11-06T17:29:25Z'),
    },
    {
      id: 'pay-2',
      paymentReference: 'PAY-1B83EE7B09F84AC3AA58',
      gatewayTransactionId: '6GK65584H96475314',
      amount: '3.96',
      currency: 'USD',
      feeEstimated: '0.00',
      paidAt: new Date('2026-11-07T08:46:58Z'),
    },
  ];

  it('matches P1 capture id and P2 custom number', () => {
    const drafts = buildPaypalFeeMatchDrafts({
      lines: [
        {
          id: 'l1',
          kind: PaypalReportLineKind.SALE_CAPTURE,
          paypalTxnId: '0EB56821XA562691D',
          customId: 'OTHER',
          gross: '6.55',
          fee: '0.33',
          net: '6.22',
          currency: 'USD',
        },
        {
          id: 'l2',
          kind: PaypalReportLineKind.SALE_CAPTURE,
          paypalTxnId: 'UNKNOWN-CAP',
          customId: 'PAY-1B83EE7B09F84AC3AA58',
          gross: '3.96',
          fee: '0.20',
          net: '3.76',
          currency: 'USD',
        },
      ],
      payments,
      duplicateTxnIds: new Set(),
      existingActiveByPaymentId: new Map(),
      existingActiveByCaptureId: new Map(),
    });

    const matched = drafts.filter((d) => d.matchStatus === PaypalFeeMatchStatus.MATCHED);
    expect(matched).toHaveLength(2);
    expect(matched[0].note).toContain('P1');
    expect(matched[1].note).toContain('P2');
    expect(matched[0].feeActual).toBe('0.33');
    expect(matched[0].feeEstimated).toBe('0.00');
  });

  it('flags missing local, amount mismatch, duplicate, payout non-sale', () => {
    const drafts = buildPaypalFeeMatchDrafts({
      lines: [
        {
          id: 'l-miss',
          kind: PaypalReportLineKind.SALE_CAPTURE,
          paypalTxnId: 'NOPE',
          customId: null,
          gross: '1.00',
          fee: '0.10',
          net: '0.90',
          currency: 'USD',
        },
        {
          id: 'l-amt',
          kind: PaypalReportLineKind.SALE_CAPTURE,
          paypalTxnId: '0EB56821XA562691D',
          customId: null,
          gross: '6.00',
          fee: '0.30',
          net: '5.70',
          currency: 'USD',
        },
        {
          id: 'l-dup',
          kind: PaypalReportLineKind.SALE_CAPTURE,
          paypalTxnId: 'DUPX',
          customId: null,
          gross: '1.00',
          fee: '0.00',
          net: '1.00',
          currency: 'USD',
        },
        {
          id: 'l-pay',
          kind: PaypalReportLineKind.PAYOUT_OR_BALANCE,
          paypalTxnId: 'WITHDRAW001',
          customId: null,
          gross: '100.00',
          fee: '0.00',
          net: '100.00',
          currency: 'USD',
        },
      ],
      payments: [payments[0]],
      duplicateTxnIds: new Set(['DUPX']),
      existingActiveByPaymentId: new Map(),
      existingActiveByCaptureId: new Map(),
    });

    expect(drafts.find((d) => d.reportLineId === 'l-miss')?.matchStatus).toBe(
      PaypalFeeMatchStatus.MISSING_LOCAL,
    );
    expect(drafts.find((d) => d.reportLineId === 'l-amt')?.matchStatus).toBe(
      PaypalFeeMatchStatus.AMOUNT_MISMATCH,
    );
    expect(drafts.find((d) => d.reportLineId === 'l-dup')?.matchStatus).toBe(
      PaypalFeeMatchStatus.DUPLICATE_CSV,
    );
    expect(drafts.find((d) => d.reportLineId === 'l-pay')?.matchStatus).toBe(
      PaypalFeeMatchStatus.NON_SALE,
    );
    expect(drafts.some((d) => d.matchStatus === PaypalFeeMatchStatus.MISSING_GATEWAY)).toBe(
      false,
    );
  });

  it('flags NEEDS_REVIEW when prior active match amounts change', () => {
    const drafts = buildPaypalFeeMatchDrafts({
      lines: [
        {
          id: 'l1',
          kind: PaypalReportLineKind.SALE_CAPTURE,
          paypalTxnId: '0EB56821XA562691D',
          customId: null,
          gross: '6.99',
          fee: '0.40',
          net: '6.59',
          currency: 'USD',
        },
      ],
      payments,
      duplicateTxnIds: new Set(),
      existingActiveByPaymentId: new Map([
        [
          'pay-1',
          {
            paymentId: 'pay-1',
            reportLinePaypalTxnId: '0EB56821XA562691D',
            grossPaypal: '6.55',
            feeActual: '0.33',
            matchStatus: PaypalFeeMatchStatus.MATCHED,
          },
        ],
      ]),
      existingActiveByCaptureId: new Map([
        [
          '0EB56821XA562691D',
          {
            paymentId: 'pay-1',
            reportLinePaypalTxnId: '0EB56821XA562691D',
            grossPaypal: '6.55',
            feeActual: '0.33',
            matchStatus: PaypalFeeMatchStatus.MATCHED,
          },
        ],
      ]),
    });

    expect(drafts[0].matchStatus).toBe(PaypalFeeMatchStatus.NEEDS_REVIEW);
  });

  it('emits MISSING_GATEWAY for unmatched SUCCESS payments', () => {
    const drafts = buildPaypalFeeMatchDrafts({
      lines: [],
      payments,
      duplicateTxnIds: new Set(),
      existingActiveByPaymentId: new Map(),
      existingActiveByCaptureId: new Map(),
    });
    expect(drafts.filter((d) => d.matchStatus === PaypalFeeMatchStatus.MISSING_GATEWAY)).toHaveLength(
      2,
    );
  });

  it('validates fee/net consistency', () => {
    expect(validateFeeNetConsistency('6.55', '0.33', '6.22')).toBe(true);
    expect(validateFeeNetConsistency('6.55', '0.33', '6.00')).toBe(false);
  });
});
