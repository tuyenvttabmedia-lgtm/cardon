import { Decimal } from '@prisma/client/runtime/library';

const CARD_FIELDS = new Set([
  'card_number',
  'card_holder_name',
  'card_expiry',
  'cvv',
  'card_cvv',
]);

export interface EsimSepayIpnDecision {
  ok: boolean;
  reason:
    | 'ACCEPTED'
    | 'MALFORMED'
    | 'NOTIFICATION_TYPE'
    | 'ORDER_STATUS'
    | 'TRANSACTION_STATUS'
    | 'CURRENCY'
    | 'AMOUNT'
    | 'INVOICE';
  invoiceNumber?: string;
  providerTransactionId?: string;
  orderAmount?: string;
  transactionAmount?: string;
  orderCurrency?: string;
  transactionCurrency?: string;
  notificationType?: string;
  orderStatus?: string;
  transactionStatus?: string;
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

export function redactEsimSepayIpn(payload: unknown): unknown {
  if (Array.isArray(payload)) return payload.map((item) => redactEsimSepayIpn(item));
  if (!payload || typeof payload !== 'object') return payload;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (CARD_FIELDS.has(key)) continue;
    out[key] = redactEsimSepayIpn(value);
  }
  return out;
}

function moneyMatches(expected: Decimal, actual: string | undefined): boolean {
  if (!actual) return false;
  try {
    return new Decimal(actual).equals(expected);
  } catch {
    return false;
  }
}

export function evaluateEsimSepayIpn(
  payload: unknown,
  expected: { invoiceNumber: string; amount: Decimal },
): EsimSepayIpnDecision {
  const body = readRecord(payload);
  const order = readRecord(body?.order);
  const transaction = readRecord(body?.transaction);
  if (!body || !order || !transaction) return { ok: false, reason: 'MALFORMED' };

  const invoiceNumber = readString(order.order_invoice_number);
  const decisionBase = {
    invoiceNumber,
    providerTransactionId: readString(transaction.id) ?? readString(transaction.transaction_id),
    orderAmount: readString(order.order_amount),
    transactionAmount: readString(transaction.transaction_amount),
    orderCurrency: readString(order.order_currency)?.toUpperCase(),
    transactionCurrency: readString(transaction.transaction_currency)?.toUpperCase(),
    notificationType: readString(body.notification_type),
    orderStatus: readString(order.order_status),
    transactionStatus: readString(transaction.transaction_status),
  };

  if (invoiceNumber !== expected.invoiceNumber) {
    return { ok: false, reason: 'INVOICE', ...decisionBase };
  }
  if (decisionBase.notificationType !== 'ORDER_PAID') {
    return { ok: false, reason: 'NOTIFICATION_TYPE', ...decisionBase };
  }
  if (decisionBase.orderStatus !== 'CAPTURED') {
    return { ok: false, reason: 'ORDER_STATUS', ...decisionBase };
  }
  if (decisionBase.transactionStatus !== 'APPROVED') {
    return { ok: false, reason: 'TRANSACTION_STATUS', ...decisionBase };
  }
  if (decisionBase.orderCurrency !== 'VND' || decisionBase.transactionCurrency !== 'VND') {
    return { ok: false, reason: 'CURRENCY', ...decisionBase };
  }
  if (
    !moneyMatches(expected.amount, decisionBase.orderAmount) ||
    !moneyMatches(expected.amount, decisionBase.transactionAmount)
  ) {
    return { ok: false, reason: 'AMOUNT', ...decisionBase };
  }
  if (!decisionBase.providerTransactionId) {
    return { ok: false, reason: 'MALFORMED', ...decisionBase };
  }
  return { ok: true, reason: 'ACCEPTED', ...decisionBase };
}
