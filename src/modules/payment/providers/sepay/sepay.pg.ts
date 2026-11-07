import { createHmac } from 'crypto';

export type SepayPgEnvironment = 'sandbox' | 'production';

export type SepayPgPaymentMethod = 'BANK_TRANSFER' | 'NAPAS_BANK_TRANSFER';

const CHECKOUT_URLS: Record<SepayPgEnvironment, string> = {
  sandbox: 'https://pay-sandbox.sepay.vn/v1/checkout/init',
  production: 'https://pay.sepay.vn/v1/checkout/init',
};

const PG_API_URLS: Record<SepayPgEnvironment, string> = {
  sandbox: 'https://pgapi-sandbox.sepay.vn',
  production: 'https://pgapi.sepay.vn',
};

/** Must match SePay docs + eSIM signer. Form POST body order must match too. */
const SIGNED_FIELD_ORDER = [
  'order_amount',
  'merchant',
  'currency',
  'operation',
  'order_description',
  'order_invoice_number',
  'customer_id',
  'payment_method',
  'success_url',
  'error_url',
  'cancel_url',
] as const;

export interface SepayPgCheckoutParams {
  merchantId: string;
  merchantSecretKey: string;
  environment: SepayPgEnvironment;
  paymentMethod: SepayPgPaymentMethod;
  orderInvoiceNumber: string;
  orderAmount: number;
  orderDescription: string;
  successUrl: string;
  errorUrl: string;
  cancelUrl: string;
  customerId?: string;
}

export function getSepayPgCheckoutUrl(environment: SepayPgEnvironment): string {
  return CHECKOUT_URLS[environment];
}

export function getSepayPgApiBaseUrl(environment: SepayPgEnvironment): string {
  return PG_API_URLS[environment];
}

export function sepayPgBasicAuth(merchantId: string, secretKey: string): string {
  return `Basic ${Buffer.from(`${merchantId}:${secretKey}`).toString('base64')}`;
}

export function mapSepayPgOrderStatus(
  status: string | undefined,
): 'SUCCESS' | 'FAILED' | 'PENDING' {
  const value = (status ?? '').trim().toUpperCase();
  if (value === 'CAPTURED') return 'SUCCESS';
  if (value === 'CANCELLED' || value === 'CANCELED' || value === 'FAILED') {
    return 'FAILED';
  }
  return 'PENDING';
}

export interface SepayPgOrderQuery {
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  amount?: string;
  providerOrderId?: string;
  raw: unknown;
}

export async function querySepayPgOrder(params: {
  environment: SepayPgEnvironment;
  merchantId: string;
  merchantSecretKey: string;
  invoiceNumber: string;
  fetchImpl?: typeof fetch;
}): Promise<SepayPgOrderQuery> {
  const invoice = params.invoiceNumber.trim();
  const url = `${getSepayPgApiBaseUrl(params.environment)}/v1/order?q=${encodeURIComponent(invoice)}&per_page=20`;
  const fetchImpl = params.fetchImpl ?? fetch;
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/json',
      Authorization: sepayPgBasicAuth(params.merchantId, params.merchantSecretKey),
    },
  });
  if (!response.ok) {
    throw new Error(`SePay PG query failed with status ${response.status}`);
  }
  const body = (await response.json()) as { data?: unknown };
  const rows = Array.isArray(body.data) ? body.data : [];
  // Exact invoice only. Never fall back to rows[0] — that can settle the wrong payment.
  const match = rows.find(
    (row) =>
      row &&
      typeof row === 'object' &&
      String((row as { order_invoice_number?: unknown }).order_invoice_number ?? '') ===
        invoice,
  );
  if (!match || typeof match !== 'object') {
    return { status: 'PENDING', raw: body };
  }
  const row = match as {
    order_status?: unknown;
    order_amount?: unknown;
    order_id?: unknown;
  };
  return {
    status: mapSepayPgOrderStatus(
      typeof row.order_status === 'string' ? row.order_status : undefined,
    ),
    amount: row.order_amount != null ? String(row.order_amount) : undefined,
    providerOrderId: typeof row.order_id === 'string' ? row.order_id : undefined,
    raw: match,
  };
}

function isSepaySignedValueIncluded(value: string | number | undefined | null): boolean {
  if (value === undefined || value === null) return false;
  const text = String(value).trim();
  return text !== '' && text !== '0';
}

export function signSepayPgFields(
  fields: Record<string, string | number | undefined>,
  secretKey: string,
): string {
  const signed: string[] = [];
  for (const field of SIGNED_FIELD_ORDER) {
    const value = fields[field];
    if (!isSepaySignedValueIncluded(value)) continue;
    signed.push(`${field}=${String(value).trim()}`);
  }
  return createHmac('sha256', secretKey)
    .update(signed.join(','))
    .digest('base64');
}

export function buildSepayPgCheckoutFields(
  params: SepayPgCheckoutParams,
): Record<string, string> {
  const baseFields: Record<string, string | number> = {
    order_amount: Math.round(params.orderAmount),
    merchant: params.merchantId,
    currency: 'VND',
    operation: 'PURCHASE',
    order_description: params.orderDescription,
    order_invoice_number: params.orderInvoiceNumber,
    payment_method: params.paymentMethod,
    success_url: params.successUrl,
    error_url: params.errorUrl,
    cancel_url: params.cancelUrl,
  };
  if (params.customerId?.trim()) {
    baseFields.customer_id = params.customerId.trim();
  }

  const signature = signSepayPgFields(baseFields, params.merchantSecretKey);
  const result: Record<string, string> = {};
  for (const field of SIGNED_FIELD_ORDER) {
    const value = baseFields[field];
    if (!isSepaySignedValueIncluded(value)) continue;
    result[field] = String(value).trim();
  }
  result.signature = signature;
  return result;
}
