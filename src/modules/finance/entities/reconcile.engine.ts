import { PaymentRecordStatus, ReconcileMatchStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { RECONCILE_STATUS_LABEL } from './finance.constants';

export interface GatewayReportLine {
  transactionId: string;
  paymentReference?: string;
  amount: string;
  status: 'SUCCESS' | 'FAILED';
  occurredAt: string;
}

export interface InternalPaymentLine {
  id: string;
  paymentReference: string;
  gatewayTransactionId: string | null;
  amount: string;
  status: PaymentRecordStatus;
  paidAt: string | null;
}

export interface ProviderReportLine {
  transactionId: string;
  quantity: number;
  cost: string;
  status: 'SUCCESS' | 'FAILED';
  occurredAt?: string;
}

export interface InternalProviderLine {
  id: string;
  requestId: string;
  providerTransactionId: string | null;
  quantity: number;
  cost: string;
  status: string;
  occurredAt: string;
}

export interface ReconcileComparisonItem {
  reference: string;
  matchStatus: ReconcileMatchStatus;
  statusLabel: string;
  localAmount: string | null;
  externalAmount: string | null;
  details?: Record<string, unknown>;
}

function decimalEquals(a: string | null, b: string | null): boolean {
  if (a == null || b == null) {
    return false;
  }
  return new Decimal(a).toFixed(2) === new Decimal(b).toFixed(2);
}

function mapPaymentStatusToExternal(status: PaymentRecordStatus): 'SUCCESS' | 'FAILED' | 'OTHER' {
  if (status === PaymentRecordStatus.SUCCESS) {
    return 'SUCCESS';
  }
  if (status === PaymentRecordStatus.FAILED) {
    return 'FAILED';
  }
  return 'OTHER';
}

function toStatusLabel(status: ReconcileMatchStatus): string {
  switch (status) {
    case ReconcileMatchStatus.MATCHED:
      return RECONCILE_STATUS_LABEL.MATCHED;
    case ReconcileMatchStatus.MISSING_GATEWAY:
      return RECONCILE_STATUS_LABEL.MISSING_GATEWAY;
    case ReconcileMatchStatus.MISSING_LOCAL:
      return RECONCILE_STATUS_LABEL.MISSING_INTERNAL;
    case ReconcileMatchStatus.AMOUNT_MISMATCH:
    case ReconcileMatchStatus.STATUS_MISMATCH:
      return RECONCILE_STATUS_LABEL.MISMATCH;
    default:
      return status;
  }
}

function sameCalendarDay(a: string | null, b: string): boolean {
  if (!a) {
    return false;
  }
  return a.slice(0, 10) === b.slice(0, 10);
}

function buildPaymentMatchKey(line: {
  transactionId?: string | null;
  paymentReference?: string | null;
}): string {
  return (line.transactionId ?? line.paymentReference ?? '').trim();
}

export function comparePaymentReconciliation(
  external: GatewayReportLine[],
  internal: InternalPaymentLine[],
): ReconcileComparisonItem[] {
  const items: ReconcileComparisonItem[] = [];
  const internalByKey = new Map<string, InternalPaymentLine>();

  for (const row of internal) {
    const keys = [row.gatewayTransactionId, row.paymentReference].filter(Boolean) as string[];
    for (const key of keys) {
      internalByKey.set(key, row);
    }
  }

  const matchedInternalIds = new Set<string>();

  for (const ext of external) {
    const key = buildPaymentMatchKey(ext);
    const local =
      internalByKey.get(ext.transactionId) ??
      (ext.paymentReference ? internalByKey.get(ext.paymentReference) : undefined);

    if (!local) {
      items.push({
        reference: key || ext.transactionId,
        matchStatus: ReconcileMatchStatus.MISSING_LOCAL,
        statusLabel: toStatusLabel(ReconcileMatchStatus.MISSING_LOCAL),
        localAmount: null,
        externalAmount: ext.amount,
        details: { source: 'gateway', transactionId: ext.transactionId },
      });
      continue;
    }

    matchedInternalIds.add(local.id);

    let matchStatus: ReconcileMatchStatus = ReconcileMatchStatus.MATCHED;
    const localExternalStatus = mapPaymentStatusToExternal(local.status);

    if (!decimalEquals(local.amount, ext.amount)) {
      matchStatus = ReconcileMatchStatus.AMOUNT_MISMATCH;
    } else if (localExternalStatus !== ext.status) {
      matchStatus = ReconcileMatchStatus.STATUS_MISMATCH;
    } else if (!sameCalendarDay(local.paidAt, ext.occurredAt)) {
      matchStatus = ReconcileMatchStatus.STATUS_MISMATCH;
    }

    items.push({
      reference: ext.transactionId || local.paymentReference,
      matchStatus,
      statusLabel: toStatusLabel(matchStatus),
      localAmount: local.amount,
      externalAmount: ext.amount,
      details: {
        paymentId: local.id,
        paymentReference: local.paymentReference,
        gatewayTransactionId: local.gatewayTransactionId,
        localStatus: local.status,
        externalStatus: ext.status,
        localPaidAt: local.paidAt,
        externalOccurredAt: ext.occurredAt,
      },
    });
  }

  for (const local of internal) {
    if (matchedInternalIds.has(local.id)) {
      continue;
    }

    items.push({
      reference: local.gatewayTransactionId ?? local.paymentReference,
      matchStatus: ReconcileMatchStatus.MISSING_GATEWAY,
      statusLabel: toStatusLabel(ReconcileMatchStatus.MISSING_GATEWAY),
      localAmount: local.amount,
      externalAmount: null,
      details: {
        paymentId: local.id,
        paymentReference: local.paymentReference,
        gatewayTransactionId: local.gatewayTransactionId,
      },
    });
  }

  return items;
}

export function compareProviderReconciliation(
  external: ProviderReportLine[],
  internal: InternalProviderLine[],
): ReconcileComparisonItem[] {
  const items: ReconcileComparisonItem[] = [];
  const internalByKey = new Map<string, InternalProviderLine>();

  for (const row of internal) {
    if (row.providerTransactionId) {
      internalByKey.set(row.providerTransactionId, row);
    }
    internalByKey.set(row.requestId, row);
  }

  const matchedInternalIds = new Set<string>();

  for (const ext of external) {
    const local = internalByKey.get(ext.transactionId);

    if (!local) {
      items.push({
        reference: ext.transactionId,
        matchStatus: ReconcileMatchStatus.MISSING_LOCAL,
        statusLabel: toStatusLabel(ReconcileMatchStatus.MISSING_LOCAL),
        localAmount: null,
        externalAmount: ext.cost,
        details: {
          source: 'provider_report',
          quantity: ext.quantity,
          status: ext.status,
        },
      });
      continue;
    }

    matchedInternalIds.add(local.id);

    let matchStatus: ReconcileMatchStatus = ReconcileMatchStatus.MATCHED;
    const localSuccess = local.status === 'SUCCESS';

    if (local.quantity !== ext.quantity) {
      matchStatus = ReconcileMatchStatus.AMOUNT_MISMATCH;
    } else if (!decimalEquals(local.cost, ext.cost)) {
      matchStatus = ReconcileMatchStatus.AMOUNT_MISMATCH;
    } else if (localSuccess !== (ext.status === 'SUCCESS')) {
      matchStatus = ReconcileMatchStatus.STATUS_MISMATCH;
    }

    items.push({
      reference: ext.transactionId,
      matchStatus,
      statusLabel: toStatusLabel(matchStatus),
      localAmount: local.cost,
      externalAmount: ext.cost,
      details: {
        providerTransactionId: local.providerTransactionId,
        requestId: local.requestId,
        localQuantity: local.quantity,
        externalQuantity: ext.quantity,
        localStatus: local.status,
        externalStatus: ext.status,
      },
    });
  }

  for (const local of internal) {
    if (matchedInternalIds.has(local.id)) {
      continue;
    }

    items.push({
      reference: local.providerTransactionId ?? local.requestId,
      matchStatus: ReconcileMatchStatus.MISSING_GATEWAY,
      statusLabel: toStatusLabel(ReconcileMatchStatus.MISSING_GATEWAY),
      localAmount: local.cost,
      externalAmount: null,
      details: {
        requestId: local.requestId,
        providerTransactionId: local.providerTransactionId,
      },
    });
  }

  return items;
}

export function summarizeReconcileItems(items: ReconcileComparisonItem[]) {
  const matched = items.filter((i) => i.matchStatus === ReconcileMatchStatus.MATCHED).length;
  const mismatch = items.length - matched;

  return {
    total: items.length,
    matched,
    mismatch,
  };
}

export function extractGatewayTransactionId(gatewayResponse: unknown): string | null {
  if (!gatewayResponse || typeof gatewayResponse !== 'object' || Array.isArray(gatewayResponse)) {
    return null;
  }
  const value = (gatewayResponse as Record<string, unknown>).gatewayTransactionId;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
