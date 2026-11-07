import { PaypalFeeMatchStatus, PaypalReportLineKind } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export type PaypalMatchPaymentInput = {
  id: string;
  paymentReference: string;
  gatewayTransactionId: string | null;
  amount: string;
  currency: string | null;
  feeEstimated: string | null;
  paidAt: Date | null;
};

export type PaypalMatchLineInput = {
  id: string;
  kind: PaypalReportLineKind;
  paypalTxnId: string;
  customId: string | null;
  gross: string;
  fee: string;
  net: string;
  currency: string;
};

export type ExistingActiveMatch = {
  paymentId: string;
  reportLinePaypalTxnId: string | null;
  grossPaypal: string | null;
  feeActual: string | null;
  matchStatus: PaypalFeeMatchStatus;
};

export type PaypalFeeMatchDraft = {
  paymentId: string | null;
  reportLineId: string | null;
  matchStatus: PaypalFeeMatchStatus;
  grossCardon: string | null;
  grossPaypal: string | null;
  feeEstimated: string | null;
  feeActual: string | null;
  netPaypal: string | null;
  grossDelta: string | null;
  feeDelta: string | null;
  currency: string;
  note?: string;
};

function moneyEq(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return false;
  return new Decimal(a).toFixed(2) === new Decimal(b).toFixed(2);
}

function moneyDelta(a: string, b: string): string {
  return new Decimal(a).minus(new Decimal(b)).toFixed(2);
}

function resolveCurrency(payment: PaypalMatchPaymentInput): string {
  const c = (payment.currency ?? '').trim().toUpperCase();
  return c || 'USD';
}

/**
 * Build auto-match drafts for one import.
 * Does not mutate payments. One active match per payment enforced by caller.
 */
export function buildPaypalFeeMatchDrafts(input: {
  lines: PaypalMatchLineInput[];
  payments: PaypalMatchPaymentInput[];
  duplicateTxnIds: Set<string>;
  existingActiveByPaymentId: Map<string, ExistingActiveMatch>;
  existingActiveByCaptureId: Map<string, ExistingActiveMatch>;
}): PaypalFeeMatchDraft[] {
  const drafts: PaypalFeeMatchDraft[] = [];
  const matchedPaymentIds = new Set<string>();

  const byCapture = new Map<string, PaypalMatchPaymentInput>();
  const byReference = new Map<string, PaypalMatchPaymentInput>();
  for (const p of input.payments) {
    if (p.gatewayTransactionId) byCapture.set(p.gatewayTransactionId, p);
    byReference.set(p.paymentReference, p);
  }

  for (const line of input.lines) {
    if (line.kind !== PaypalReportLineKind.SALE_CAPTURE) {
      drafts.push({
        paymentId: null,
        reportLineId: line.id,
        matchStatus: PaypalFeeMatchStatus.NON_SALE,
        grossCardon: null,
        grossPaypal: line.gross,
        feeEstimated: null,
        feeActual: line.fee,
        netPaypal: line.net,
        grossDelta: null,
        feeDelta: null,
        currency: line.currency,
        note: `classified:${line.kind}`,
      });
      continue;
    }

    if (input.duplicateTxnIds.has(line.paypalTxnId)) {
      drafts.push({
        paymentId: null,
        reportLineId: line.id,
        matchStatus: PaypalFeeMatchStatus.DUPLICATE_CSV,
        grossCardon: null,
        grossPaypal: line.gross,
        feeEstimated: null,
        feeActual: line.fee,
        netPaypal: line.net,
        grossDelta: null,
        feeDelta: null,
        currency: line.currency,
        note: 'duplicate Transaction ID in CSV',
      });
      continue;
    }

    const priorByTxn = input.existingActiveByCaptureId.get(line.paypalTxnId);
    if (priorByTxn && priorByTxn.paymentId) {
      const grossChanged =
        priorByTxn.grossPaypal != null && !moneyEq(priorByTxn.grossPaypal, line.gross);
      const feeChanged =
        priorByTxn.feeActual != null && !moneyEq(priorByTxn.feeActual, line.fee);
      if (grossChanged || feeChanged) {
        drafts.push({
          paymentId: priorByTxn.paymentId,
          reportLineId: line.id,
          matchStatus: PaypalFeeMatchStatus.NEEDS_REVIEW,
          grossCardon: null,
          grossPaypal: line.gross,
          feeEstimated: null,
          feeActual: line.fee,
          netPaypal: line.net,
          grossDelta:
            priorByTxn.grossPaypal != null
              ? moneyDelta(line.gross, priorByTxn.grossPaypal)
              : null,
          feeDelta:
            priorByTxn.feeActual != null ? moneyDelta(line.fee, priorByTxn.feeActual) : null,
          currency: line.currency,
          note: 'CSV values changed vs active match — previous result kept active',
        });
        matchedPaymentIds.add(priorByTxn.paymentId);
        continue;
      }
    }

    let payment = byCapture.get(line.paypalTxnId) ?? null;
    let via: 'P1' | 'P2' | null = payment ? 'P1' : null;
    if (!payment && line.customId) {
      payment = byReference.get(line.customId) ?? null;
      if (payment) via = 'P2';
    }

    if (!payment) {
      drafts.push({
        paymentId: null,
        reportLineId: line.id,
        matchStatus: PaypalFeeMatchStatus.MISSING_LOCAL,
        grossCardon: null,
        grossPaypal: line.gross,
        feeEstimated: null,
        feeActual: line.fee,
        netPaypal: line.net,
        grossDelta: null,
        feeDelta: null,
        currency: line.currency,
      });
      continue;
    }

    if (matchedPaymentIds.has(payment.id) || input.existingActiveByPaymentId.has(payment.id)) {
      // Already has active match — do not create second active; flag review on this line only
      if (!input.existingActiveByPaymentId.has(payment.id)) {
        // matched earlier in this same run — skip creating second
      }
      drafts.push({
        paymentId: payment.id,
        reportLineId: line.id,
        matchStatus: PaypalFeeMatchStatus.NEEDS_REVIEW,
        grossCardon: payment.amount,
        grossPaypal: line.gross,
        feeEstimated: payment.feeEstimated,
        feeActual: line.fee,
        netPaypal: line.net,
        grossDelta: moneyDelta(line.gross, payment.amount),
        feeDelta:
          payment.feeEstimated != null ? moneyDelta(line.fee, payment.feeEstimated) : null,
        currency: line.currency,
        note: 'payment already has an active match — not activating second',
      });
      continue;
    }

    const payCurrency = resolveCurrency(payment);
    if (payCurrency !== line.currency.toUpperCase()) {
      drafts.push({
        paymentId: payment.id,
        reportLineId: line.id,
        matchStatus: PaypalFeeMatchStatus.CURRENCY_MISMATCH,
        grossCardon: payment.amount,
        grossPaypal: line.gross,
        feeEstimated: payment.feeEstimated,
        feeActual: line.fee,
        netPaypal: line.net,
        grossDelta: moneyDelta(line.gross, payment.amount),
        feeDelta:
          payment.feeEstimated != null ? moneyDelta(line.fee, payment.feeEstimated) : null,
        currency: line.currency,
        note: via ? `matched_via:${via}` : undefined,
      });
      matchedPaymentIds.add(payment.id);
      continue;
    }

    if (!moneyEq(payment.amount, line.gross)) {
      drafts.push({
        paymentId: payment.id,
        reportLineId: line.id,
        matchStatus: PaypalFeeMatchStatus.AMOUNT_MISMATCH,
        grossCardon: payment.amount,
        grossPaypal: line.gross,
        feeEstimated: payment.feeEstimated,
        feeActual: line.fee,
        netPaypal: line.net,
        grossDelta: moneyDelta(line.gross, payment.amount),
        feeDelta:
          payment.feeEstimated != null ? moneyDelta(line.fee, payment.feeEstimated) : null,
        currency: line.currency,
        note: via ? `matched_via:${via}` : undefined,
      });
      matchedPaymentIds.add(payment.id);
      continue;
    }

    drafts.push({
      paymentId: payment.id,
      reportLineId: line.id,
      matchStatus: PaypalFeeMatchStatus.MATCHED,
      grossCardon: payment.amount,
      grossPaypal: line.gross,
      feeEstimated: payment.feeEstimated,
      feeActual: line.fee,
      netPaypal: line.net,
      grossDelta: '0.00',
      feeDelta:
        payment.feeEstimated != null ? moneyDelta(line.fee, payment.feeEstimated) : null,
      currency: line.currency,
      note: via ? `matched_via:${via}` : undefined,
    });
    matchedPaymentIds.add(payment.id);
  }

  for (const payment of input.payments) {
    if (matchedPaymentIds.has(payment.id)) continue;
    if (input.existingActiveByPaymentId.has(payment.id)) continue;
    drafts.push({
      paymentId: payment.id,
      reportLineId: null,
      matchStatus: PaypalFeeMatchStatus.MISSING_GATEWAY,
      grossCardon: payment.amount,
      grossPaypal: null,
      feeEstimated: payment.feeEstimated,
      feeActual: null,
      netPaypal: null,
      grossDelta: null,
      feeDelta: null,
      currency: resolveCurrency(payment),
    });
  }

  return drafts;
}

export function validateFeeNetConsistency(gross: string, fee: string, net: string): boolean {
  // Allow either gross - fee = net or gross + (-fee) conventions already normalized to abs fee
  const expected = new Decimal(gross).minus(new Decimal(fee)).toFixed(2);
  if (expected === new Decimal(net).toFixed(2)) return true;
  // Some Activity files show fee as negative contribution already in net only
  const alt = new Decimal(gross).plus(new Decimal(fee)).toFixed(2);
  return alt === new Decimal(net).toFixed(2);
}
