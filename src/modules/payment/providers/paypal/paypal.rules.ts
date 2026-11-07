/**
 * PayPal eSIM (USD) decisions. No HTTP, no Airalo, no SePay.
 * LIVE never falls through to the sandbox host.
 */

export type PaypalMode = 'sandbox' | 'live';

export type PaypalPaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED';

export type PaypalCaptureState =
  | 'CREATED'
  | 'APPROVED'
  | 'CAPTURING'
  | 'CAPTURED'
  | 'UNKNOWN'
  | 'DECLINED'
  | 'CANCELLED';

export interface PaypalRuntimeConfig {
  esimEnabled: boolean;
  mode: PaypalMode;
  clientId: string;
  clientSecret: string;
  webhookId: string;
}

export interface PaypalSnapshot {
  paymentStatus: PaypalPaymentStatus;
  amount: string;
  captureState: PaypalCaptureState | null;
  paypalOrderId: string | null;
  captureId: string | null;
  fulfillmentQueued: boolean;
}

export type PaypalObservation =
  | { kind: 'completed'; captureId: string; amount: string; currency: string }
  | { kind: 'approved' }
  | { kind: 'open' }
  | { kind: 'voided' }
  | { kind: 'declined'; reason: string }
  | { kind: 'unknown' };

export interface PaypalPlan {
  step: 'none' | 'capture' | 'query';
  paymentStatus: PaypalPaymentStatus;
  captureState: PaypalCaptureState | null;
  captureId: string | null;
  /** Enqueue fulfillment only after a confirmed capture. Never an Airalo call. */
  fulfillment: boolean;
  newPaypalOrder: boolean;
  captureApi: boolean;
  airaloCreate: false;
  duplicate: boolean;
}

export type PaypalConnectionStatus =
  | 'NOT_CONFIGURED'
  | 'INCOMPLETE'
  | 'CONFIGURED'
  | 'CONNECTION_ERROR';

const PAYPAL_PLACEHOLDERS = new Set([
  'dán paypal client_id',
  'dán paypal client_secret',
  'paypal webhook id',
  'paste paypal client id',
  'paste paypal client secret',
]);

/** A blank or masked field is not a new secret. Placeholder text must not be stored. */
export function isPaypalPlaceholder(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  return PAYPAL_PLACEHOLDERS.has(value.trim().toLowerCase());
}

/**
 * Credential completeness only. CONNECTED is never returned: a token check is separate
 * and a failed check becomes CONNECTION_ERROR only when the set is otherwise complete.
 */
export function paypalCredentialStatus(input: {
  clientId: string;
  clientSecret: string;
  webhookId: string;
  lastProbeOk?: boolean | null;
}): PaypalConnectionStatus {
  const present = [input.clientId, input.clientSecret, input.webhookId].filter((value) => value.trim()).length;
  if (present === 0) return 'NOT_CONFIGURED';
  if (present < 3) return 'INCOMPLETE';
  if (input.lastProbeOk === false) return 'CONNECTION_ERROR';
  return 'CONFIGURED';
}

export type PaypalReady =
  | { ok: true; mode: PaypalMode }
  | { ok: false; reason: 'DISABLED' | 'MISSING_CREDENTIALS' | 'LIVE_REQUIRES_WEBHOOK' | 'LIVE_REQUIRES_CREDENTIALS' };

const SANDBOX_API = 'https://api-m.sandbox.paypal.com';
const LIVE_API = 'https://api-m.paypal.com';

export function paypalApiBaseUrl(mode: PaypalMode): string {
  if (mode === 'live') return LIVE_API;
  if (mode === 'sandbox') return SANDBOX_API;
  throw new Error('UNKNOWN_PAYPAL_MODE');
}

/** Saving LIVE config. Does not enable checkout and does not rewrite the mode. */
export function evaluatePaypalLiveGuard(config: Pick<
  PaypalRuntimeConfig,
  'mode' | 'clientId' | 'clientSecret' | 'webhookId'
>): PaypalReady {
  if (config.mode !== 'live') return { ok: true, mode: config.mode };
  if (!config.clientId.trim() || !config.clientSecret.trim() || !config.webhookId.trim()) {
    return { ok: false, reason: 'LIVE_REQUIRES_CREDENTIALS' };
  }
  return { ok: true, mode: 'live' };
}

/** Capture, query, and webhook verification. Checkout flag is not required. */
export function evaluatePaypalApiReady(config: PaypalRuntimeConfig): PaypalReady {
  if (!config.clientId.trim() || !config.clientSecret.trim()) {
    return { ok: false, reason: 'MISSING_CREDENTIALS' };
  }
  if (config.mode === 'live' && !config.webhookId.trim()) {
    return { ok: false, reason: 'LIVE_REQUIRES_WEBHOOK' };
  }
  return { ok: true, mode: config.mode };
}

/** Creating a customer PayPal order. Flag stays off until operations arm it. */
export function evaluatePaypalCheckoutReady(config: PaypalRuntimeConfig): PaypalReady {
  if (!config.esimEnabled) return { ok: false, reason: 'DISABLED' };
  return evaluatePaypalApiReady(config);
}

export function planPaypalSettlement(input: {
  snapshot: PaypalSnapshot;
  observation?: PaypalObservation | null;
}): PaypalPlan {
  const snapshot = input.snapshot;
  const observation = input.observation ?? null;

  if (snapshot.paymentStatus === 'SUCCESS') {
    return base(snapshot, {
      paymentStatus: 'SUCCESS',
      captureState: snapshot.captureState ?? 'CAPTURED',
      fulfillment: !snapshot.fulfillmentQueued,
      duplicate: true,
    });
  }

  if (snapshot.paymentStatus === 'FAILED' || snapshot.paymentStatus === 'EXPIRED') {
    return base(snapshot, { duplicate: true });
  }

  if (!observation) {
    if (!snapshot.paypalOrderId) return base(snapshot, {});
    if (
      snapshot.captureState === 'UNKNOWN' ||
      snapshot.captureState === 'CAPTURING' ||
      snapshot.captureState === 'CAPTURED'
    ) {
      return base(snapshot, { step: 'query' });
    }
    if (snapshot.captureState === 'DECLINED' || snapshot.captureState === 'CANCELLED') {
      return base(snapshot, { paymentStatus: 'FAILED' });
    }
    return base(snapshot, { step: 'capture', captureApi: true });
  }

  if (observation.kind === 'unknown' || observation.kind === 'open' || observation.kind === 'approved') {
    const blocking =
      observation.kind === 'unknown' ||
      snapshot.captureState === 'UNKNOWN' ||
      snapshot.captureState === 'CAPTURING';
    const captureState: PaypalCaptureState = blocking
      ? 'UNKNOWN'
      : observation.kind === 'approved'
        ? 'APPROVED'
        : (snapshot.captureState ?? 'CREATED');
    return base(snapshot, { captureState, paymentStatus: 'PENDING' });
  }

  if (observation.kind === 'declined') {
    return base(snapshot, { paymentStatus: 'FAILED', captureState: 'DECLINED' });
  }
  if (observation.kind === 'voided') {
    return base(snapshot, { paymentStatus: 'FAILED', captureState: 'CANCELLED' });
  }

  const currency = observation.currency.trim().toUpperCase();
  if (currency !== 'USD' || !moneyEq(snapshot.amount, observation.amount)) {
    return base(snapshot, { captureState: 'UNKNOWN', paymentStatus: 'PENDING' });
  }

  return base(snapshot, {
    paymentStatus: 'SUCCESS',
    captureState: 'CAPTURED',
    captureId: observation.captureId,
    fulfillment: true,
  });
}

export function readPaypalSnapshot(payment: {
  status: string;
  amount: { toString(): string } | string | number;
  gatewayResponse: unknown;
}): PaypalSnapshot {
  const raw =
    payment.gatewayResponse && typeof payment.gatewayResponse === 'object'
      ? (payment.gatewayResponse as Record<string, unknown>)
      : {};
  const status = payment.status;
  const paymentStatus: PaypalPaymentStatus =
    status === 'SUCCESS' || status === 'FAILED' || status === 'EXPIRED' || status === 'PENDING'
      ? status
      : 'PENDING';
  const orderId =
    typeof raw.paypalOrderId === 'string'
      ? raw.paypalOrderId
      : typeof raw.providerReference === 'string'
        ? raw.providerReference
        : null;
  const captureState = isCaptureState(raw.captureState) ? raw.captureState : null;
  return {
    paymentStatus,
    amount: toMoney(payment.amount),
    captureState,
    paypalOrderId: orderId,
    captureId: typeof raw.captureId === 'string' ? raw.captureId : null,
    fulfillmentQueued: raw.fulfillmentQueued === true,
  };
}

export interface ParsedPaypalOrder {
  orderId: string;
  approveUrl: string | null;
  customId: string | null;
  observation: PaypalObservation;
}

export function parsePaypalOrder(body: unknown): ParsedPaypalOrder | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const orderId = typeof record.id === 'string' ? record.id : '';
  if (!orderId) return null;
  const units = Array.isArray(record.purchase_units) ? record.purchase_units : [];
  const unit = units[0] && typeof units[0] === 'object' ? (units[0] as Record<string, unknown>) : {};
  const customId = stringField(unit.custom_id) ?? stringField(record.custom_id);
  const approveUrl = readApproveLink(record.links);
  const status = typeof record.status === 'string' ? record.status.toUpperCase() : '';
  const capture = readCapture(unit);
  if (capture) {
    return { orderId, approveUrl, customId, observation: capture };
  }
  if (status === 'COMPLETED') {
    return { orderId, approveUrl, customId, observation: { kind: 'unknown' } };
  }
  if (status === 'APPROVED') {
    return { orderId, approveUrl, customId, observation: { kind: 'approved' } };
  }
  if (status === 'VOIDED') {
    return { orderId, approveUrl, customId, observation: { kind: 'voided' } };
  }
  if (status === 'CREATED' || status === 'PAYER_ACTION_REQUIRED') {
    return { orderId, approveUrl, customId, observation: { kind: 'open' } };
  }
  return { orderId, approveUrl, customId, observation: { kind: 'unknown' } };
}

export interface ParsedPaypalWebhook {
  eventType: string;
  paymentReference: string;
  orderId: string;
  observation: PaypalObservation;
}

export function parsePaypalWebhook(payload: unknown): ParsedPaypalWebhook | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  const eventType = typeof record.event_type === 'string' ? record.event_type : '';
  const resource =
    record.resource && typeof record.resource === 'object'
      ? (record.resource as Record<string, unknown>)
      : {};
  if (!eventType) return null;

  if (eventType === 'CHECKOUT.ORDER.APPROVED' || eventType === 'CHECKOUT.ORDER.COMPLETED') {
    const parsed = parsePaypalOrder(resource);
    if (!parsed) return null;
    return {
      eventType,
      paymentReference: parsed.customId ?? '',
      orderId: parsed.orderId,
      observation: eventType === 'CHECKOUT.ORDER.APPROVED' ? { kind: 'approved' } : parsed.observation,
    };
  }

  if (eventType === 'PAYMENT.CAPTURE.COMPLETED' || eventType === 'PAYMENT.CAPTURE.DENIED') {
    const captureId = stringField(resource.id) ?? '';
    const amount = readMoney(resource.amount);
    const customId = stringField(resource.custom_id) ?? '';
    const related =
      resource.supplementary_data && typeof resource.supplementary_data === 'object'
        ? (resource.supplementary_data as Record<string, unknown>).related_ids
        : undefined;
    const orderId =
      related && typeof related === 'object'
        ? stringField((related as Record<string, unknown>).order_id) ?? ''
        : '';
    if (eventType === 'PAYMENT.CAPTURE.DENIED') {
      return {
        eventType,
        paymentReference: customId,
        orderId,
        observation: { kind: 'declined', reason: 'CAPTURE_DENIED' },
      };
    }
    if (!captureId || !amount) {
      return {
        eventType,
        paymentReference: customId,
        orderId,
        observation: { kind: 'unknown' },
      };
    }
    return {
      eventType,
      paymentReference: customId,
      orderId,
      observation: {
        kind: 'completed',
        captureId,
        amount: amount.value,
        currency: amount.currency,
      },
    };
  }

  if (eventType === 'CHECKOUT.ORDER.VOIDED' || eventType === 'PAYMENT.CAPTURE.REVERSED') {
    const parsed = parsePaypalOrder(resource);
    return {
      eventType,
      paymentReference: parsed?.customId ?? stringField(resource.custom_id) ?? '',
      orderId: parsed?.orderId ?? stringField(resource.id) ?? '',
      observation: { kind: 'voided' },
    };
  }

  return {
    eventType,
    paymentReference: '',
    orderId: '',
    observation: { kind: 'unknown' },
  };
}

/**
 * Admin-test and any non-eSIM PayPal capture webhook.
 * CHECKOUT.ORDER.APPROVED is unchanged: capture already used the stored order id.
 * A capture event must carry USD, the payment amount, and that same order id.
 */
export function evaluatePaypalWebhookIdentity(input: {
  payload: unknown;
  storedOrderId: string | null;
  expectedAmount: string;
}): { ok: true } | { ok: false; reason: string } {
  const parsed = parsePaypalWebhook(input.payload);
  if (!parsed || parsed.eventType !== 'PAYMENT.CAPTURE.COMPLETED') return { ok: true };
  if (parsed.observation.kind !== 'completed') {
    return { ok: false, reason: 'CAPTURE_UNCONFIRMED' };
  }
  if (parsed.observation.currency.trim().toUpperCase() !== 'USD') {
    return { ok: false, reason: 'CURRENCY_MISMATCH' };
  }
  if (!moneyEq(input.expectedAmount, parsed.observation.amount)) {
    return { ok: false, reason: 'AMOUNT_MISMATCH' };
  }
  if (!parsed.orderId || !input.storedOrderId || parsed.orderId !== input.storedOrderId) {
    return { ok: false, reason: 'ORDER_ID_MISMATCH' };
  }
  if (!parsed.observation.captureId) return { ok: false, reason: 'MISSING_CAPTURE' };
  return { ok: true };
}

/** Customer eSIM capture. Missing order id, currency, or capture id never settles. */
export function evaluateEsimPaypalCapture(input: {
  payload: unknown;
  storedOrderId: string | null;
  expectedAmount: string;
  paymentCurrency: string | null;
  productLane: string | null;
  gateway: string;
}): { ok: true; captureId: string; orderId: string } | { ok: false; reason: string } {
  if (input.productLane !== 'ESIM' || input.gateway !== 'PAYPAL') {
    return { ok: false, reason: 'LANE' };
  }
  if ((input.paymentCurrency ?? '').trim().toUpperCase() !== 'USD') {
    return { ok: false, reason: 'CURRENCY' };
  }
  const parsed = parsePaypalWebhook(input.payload);
  if (!parsed || parsed.observation.kind !== 'completed') {
    return { ok: false, reason: 'CAPTURE' };
  }
  if (parsed.observation.currency.trim().toUpperCase() !== 'USD') {
    return { ok: false, reason: 'CURRENCY' };
  }
  if (!moneyEq(input.expectedAmount, parsed.observation.amount)) {
    return { ok: false, reason: 'AMOUNT' };
  }
  if (!parsed.orderId || !input.storedOrderId || parsed.orderId !== input.storedOrderId) {
    return { ok: false, reason: 'ORDER_ID' };
  }
  if (!parsed.observation.captureId) return { ok: false, reason: 'CAPTURE' };
  return { ok: true, captureId: parsed.observation.captureId, orderId: parsed.orderId };
}

function base(snapshot: PaypalSnapshot, extra: Partial<PaypalPlan>): PaypalPlan {
  return {
    step: 'none',
    paymentStatus: snapshot.paymentStatus,
    captureState: snapshot.captureState,
    captureId: snapshot.captureId,
    fulfillment: false,
    newPaypalOrder: false,
    captureApi: false,
    airaloCreate: false,
    duplicate: false,
    ...extra,
  };
}

function moneyEq(expected: string, received: string): boolean {
  const left = Number(expected);
  const right = Number(received);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return left.toFixed(2) === right.toFixed(2);
}

function toMoney(amount: { toString(): string } | string | number): string {
  const numeric = Number(typeof amount === 'object' ? amount.toString() : amount);
  if (!Number.isFinite(numeric)) return '0.00';
  return numeric.toFixed(2);
}

function isCaptureState(value: unknown): value is PaypalCaptureState {
  return (
    value === 'CREATED' ||
    value === 'APPROVED' ||
    value === 'CAPTURING' ||
    value === 'CAPTURED' ||
    value === 'UNKNOWN' ||
    value === 'DECLINED' ||
    value === 'CANCELLED'
  );
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function readApproveLink(links: unknown): string | null {
  if (!Array.isArray(links)) return null;
  for (const link of links) {
    if (!link || typeof link !== 'object') continue;
    const row = link as Record<string, unknown>;
    const rel = typeof row.rel === 'string' ? row.rel : '';
    if ((rel === 'approve' || rel === 'payer-action') && typeof row.href === 'string') {
      return row.href;
    }
  }
  return null;
}

function readMoney(value: unknown): { currency: string; value: string } | null {
  if (!value || typeof value !== 'object') return null;
  const amount = value as Record<string, unknown>;
  const currency = typeof amount.currency_code === 'string' ? amount.currency_code : '';
  const raw = typeof amount.value === 'string' ? amount.value : '';
  if (!currency || !raw) return null;
  return { currency, value: raw };
}

function readCapture(unit: Record<string, unknown>): PaypalObservation | null {
  const payments =
    unit.payments && typeof unit.payments === 'object'
      ? (unit.payments as Record<string, unknown>)
      : null;
  const captures = payments && Array.isArray(payments.captures) ? payments.captures : [];
  const first = captures[0] && typeof captures[0] === 'object' ? (captures[0] as Record<string, unknown>) : null;
  if (!first) return null;
  const captureStatus = typeof first.status === 'string' ? first.status.toUpperCase() : '';
  const captureId = stringField(first.id) ?? '';
  const amount = readMoney(first.amount);
  if (captureStatus === 'COMPLETED' && captureId && amount) {
    return { kind: 'completed', captureId, amount: amount.value, currency: amount.currency };
  }
  if (captureStatus === 'DECLINED' || captureStatus === 'FAILED') {
    return { kind: 'declined', reason: captureStatus };
  }
  if (captureStatus === 'PENDING') {
    return { kind: 'unknown' };
  }
  return { kind: 'unknown' };
}
