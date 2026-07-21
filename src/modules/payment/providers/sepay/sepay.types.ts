export const SEPAY_TRANSFER_PREFIX = 'CARDON';

export interface SepayWebhookPayload {
  id: number;
  gateway?: string;
  transactionDate?: string;
  accountNumber?: string;
  subAccount?: string;
  code?: string | null;
  content: string;
  transferType: 'in' | 'out' | string;
  description?: string;
  transferAmount: number;
  accumulated?: number;
  referenceCode?: string;
}

export interface SepayBankInfo {
  bankCode: string;
  accountNumber: string;
  accountName: string;
}

export interface SepayCreatePaymentResult {
  qrUrl: string;
  bankInfo: SepayBankInfo;
  amount: number;
  transferContent: string;
  expiredAt: string;
}

export function buildTransferContent(paymentReference: string): string {
  // Prefer bare DH* codes so SePay can extract `code` for webhook filters.
  if (/^DH[0-9A-Z]{4,30}$/i.test(paymentReference.trim())) {
    return paymentReference.trim().toUpperCase();
  }
  return `${SEPAY_TRANSFER_PREFIX} ${paymentReference}`;
}

/** Extract CardOn payment_reference from SePay transfer content or code field. */
export function extractPaymentReference(
  content: string,
  code?: string | null,
): string | null {
  const fromContent = matchPaymentReference(content);
  if (fromContent) {
    return fromContent;
  }
  if (code) {
    const fromCode = matchPaymentReference(code);
    if (fromCode) {
      return fromCode;
    }
  }
  return null;
}

function matchPaymentReference(text: string): string | null {
  const dhMatch = text.match(/\b(DH[0-9A-Z]{4,30})\b/i);
  if (dhMatch) {
    return dhMatch[1].toUpperCase();
  }
  const cardonMatch = text.match(/CARDON\s+((?:PAY|DEP)-[A-Z0-9-]+)/i);
  if (cardonMatch) {
    return cardonMatch[1].toUpperCase();
  }
  const refMatch = text.match(/((?:PAY|DEP)-[A-Z0-9-]+)/i);
  if (refMatch) {
    return refMatch[1].toUpperCase();
  }
  return null;
}

export function formatSepayAmount(transferAmount: number): string {
  return transferAmount.toFixed(2);
}

export function mapSepayTransferToStatus(
  transferType: string,
  paymentReference: string | null,
): 'SUCCESS' | 'PENDING' {
  if (!paymentReference) {
    return 'PENDING';
  }
  if (transferType.toLowerCase() === 'in') {
    return 'SUCCESS';
  }
  return 'PENDING';
}

export interface SepayPgIpnPayload {
  timestamp?: number;
  notification_type?: string;
  order?: {
    order_invoice_number?: string;
    order_amount?: string;
    order_status?: string;
  };
  transaction?: {
    transaction_id?: string;
    transaction_status?: string;
    transaction_amount?: string;
  };
}

export function isSepayPgIpnPayload(payload: unknown): payload is SepayPgIpnPayload {
  return (
    !!payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    'notification_type' in payload
  );
}

export function mapSepayPgIpnToVerification(payload: SepayPgIpnPayload): {
  paymentReference: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  amount?: string;
  providerTransactionId?: string;
} {
  const paymentReference = payload.order?.order_invoice_number?.trim() ?? '';
  const txStatus = payload.transaction?.transaction_status?.toUpperCase() ?? '';
  const notificationType = payload.notification_type?.toUpperCase() ?? '';

  if (
    notificationType === 'ORDER_PAID' &&
    txStatus === 'APPROVED' &&
    paymentReference
  ) {
    const amount =
      payload.order?.order_amount ??
      payload.transaction?.transaction_amount ??
      undefined;
    return {
      paymentReference,
      status: 'SUCCESS',
      amount: amount != null ? formatSepayAmount(Number(amount)) : undefined,
      providerTransactionId: payload.transaction?.transaction_id
        ? String(payload.transaction.transaction_id)
        : undefined,
    };
  }

  if (txStatus === 'DECLINED' || txStatus === 'FAILED') {
    return {
      paymentReference,
      status: 'FAILED',
    };
  }

  return {
    paymentReference,
    status: 'PENDING',
  };
}
