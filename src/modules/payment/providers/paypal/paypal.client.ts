import {
  evaluatePaypalApiReady,
  parsePaypalOrder,
  paypalApiBaseUrl,
  type ParsedPaypalOrder,
  type PaypalObservation,
  type PaypalRuntimeConfig,
} from './paypal.rules';

export class PaypalApiError extends Error {
  constructor(
    readonly status: number,
    readonly issue: string,
  ) {
    super('PayPal API error');
  }
}

export type PaypalFetch = (
  input: string,
  init?: RequestInit,
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export class PaypalClient {
  constructor(private readonly fetchImpl: PaypalFetch = fetch as PaypalFetch) {}

  async createOrder(
    config: PaypalRuntimeConfig,
    input: {
      paymentReference: string;
      amount: string;
      returnUrl: string;
      cancelUrl: string;
    },
  ): Promise<ParsedPaypalOrder> {
    const body = await this.request(config, '/v2/checkout/orders', {
      method: 'POST',
      requestId: input.paymentReference,
      json: {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: input.paymentReference,
            custom_id: input.paymentReference,
            amount: { currency_code: 'USD', value: input.amount },
          },
        ],
        application_context: {
          return_url: input.returnUrl,
          cancel_url: input.cancelUrl,
          brand_name: 'CardOn',
          user_action: 'PAY_NOW',
          shipping_preference: 'NO_SHIPPING',
        },
      },
    });
    const parsed = parsePaypalOrder(body);
    if (!parsed?.approveUrl) {
      throw new PaypalApiError(502, 'MISSING_APPROVAL_URL');
    }
    return parsed;
  }

  async captureOrder(config: PaypalRuntimeConfig, paypalOrderId: string, requestId: string): Promise<PaypalObservation> {
    try {
      const body = await this.request(config, `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
        method: 'POST',
        requestId: `capture-${requestId}`,
        json: {},
      });
      return parsePaypalOrder(body)?.observation ?? { kind: 'unknown' };
    } catch (error) {
      return this.observationFromError(error);
    }
  }

  async readOrder(config: PaypalRuntimeConfig, paypalOrderId: string): Promise<PaypalObservation> {
    try {
      const body = await this.request(
        config,
        `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`,
        { method: 'GET' },
      );
      return parsePaypalOrder(body)?.observation ?? { kind: 'unknown' };
    } catch (error) {
      if (error instanceof PaypalApiError && error.status >= 400 && error.status < 500 && error.status !== 408) {
        return { kind: 'unknown' };
      }
      return { kind: 'unknown' };
    }
  }

  /**
   * Sandbox token check only. LIVE returns before any HTTP call and does not switch host.
   */
  async probeAccessToken(
    config: PaypalRuntimeConfig,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (config.mode === 'live') {
      return { ok: false, reason: 'LIVE_PROBE_DISABLED' };
    }
    if (!config.clientId.trim() || !config.clientSecret.trim() || !config.webhookId.trim()) {
      return { ok: false, reason: 'INCOMPLETE' };
    }
    try {
      await this.accessToken(config, paypalApiBaseUrl('sandbox'));
      return { ok: true };
    } catch (error) {
      if (error instanceof PaypalApiError) {
        return { ok: false, reason: error.status === 408 ? 'TIMEOUT' : 'CONNECTION_ERROR' };
      }
      return { ok: false, reason: 'CONNECTION_ERROR' };
    }
  }

  async verifyWebhookSignature(
    config: PaypalRuntimeConfig,
    headers: Record<string, string>,
    payload: unknown,
  ): Promise<boolean> {
    const ready = evaluatePaypalApiReady(config);
    if (!ready.ok || !config.webhookId.trim()) return false;
    const transmissionId = headerValue(headers, 'paypal-transmission-id');
    const transmissionSig = headerValue(headers, 'paypal-transmission-sig');
    const transmissionTime = headerValue(headers, 'paypal-transmission-time');
    const certUrl = headerValue(headers, 'paypal-cert-url');
    const authAlgo = headerValue(headers, 'paypal-auth-algo');
    if (!transmissionId || !transmissionSig || !transmissionTime || !certUrl || !authAlgo) {
      return false;
    }
    try {
      const body = await this.request(config, '/v1/notifications/verify-webhook-signature', {
        method: 'POST',
        json: {
          auth_algo: authAlgo,
          cert_url: certUrl,
          transmission_id: transmissionId,
          transmission_sig: transmissionSig,
          transmission_time: transmissionTime,
          webhook_id: config.webhookId,
          webhook_event: payload,
        },
      });
      return (
        !!body &&
        typeof body === 'object' &&
        (body as Record<string, unknown>).verification_status === 'SUCCESS'
      );
    } catch {
      return false;
    }
  }

  private observationFromError(error: unknown): PaypalObservation {
    if (!(error instanceof PaypalApiError)) return { kind: 'unknown' };
    if (error.status === 408 || error.status >= 500) return { kind: 'unknown' };
    if (error.issue === 'ORDER_ALREADY_CAPTURED') return { kind: 'unknown' };
    if (error.issue === 'ORDER_NOT_APPROVED' || error.issue === 'INSTRUMENT_DECLINED') {
      return { kind: 'declined', reason: error.issue };
    }
    if (error.status >= 400 && error.status < 500) {
      return { kind: 'declined', reason: error.issue || 'PAYPAL_REJECTED' };
    }
    return { kind: 'unknown' };
  }

  private async request(
    config: PaypalRuntimeConfig,
    path: string,
    init: { method: string; json?: unknown; requestId?: string },
  ): Promise<unknown> {
    const ready = evaluatePaypalApiReady(config);
    if (!ready.ok) {
      throw new PaypalApiError(401, ready.reason);
    }
    const base = paypalApiBaseUrl(ready.mode);
    const token = await this.accessToken(config, base);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await this.fetchImpl(`${base}${path}`, {
        method: init.method,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          accept: 'application/json',
          ...(init.requestId ? { 'paypal-request-id': init.requestId } : {}),
        },
        body: init.json === undefined ? undefined : JSON.stringify(init.json),
        signal: controller.signal,
      });
      const text = await response.text();
      const parsed = text ? safeJson(text) : {};
      if (!response.ok) {
        throw new PaypalApiError(response.status, readIssue(parsed));
      }
      return parsed;
    } catch (error) {
      if (error instanceof PaypalApiError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new PaypalApiError(408, 'TIMEOUT');
      }
      throw new PaypalApiError(502, 'UNAVAILABLE');
    } finally {
      clearTimeout(timer);
    }
  }

  private async accessToken(config: PaypalRuntimeConfig, base: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await this.fetchImpl(`${base}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: 'grant_type=client_credentials',
        signal: controller.signal,
      });
      const text = await response.text();
      const parsed = text ? safeJson(text) : {};
      const token =
        parsed && typeof parsed === 'object'
          ? (parsed as Record<string, unknown>).access_token
          : undefined;
      if (!response.ok || typeof token !== 'string' || !token) {
        throw new PaypalApiError(response.status || 502, 'TOKEN');
      }
      return token;
    } catch (error) {
      if (error instanceof PaypalApiError) throw error;
      throw new PaypalApiError(408, 'TIMEOUT');
    } finally {
      clearTimeout(timer);
    }
  }
}

function headerValue(headers: Record<string, string>, name: string): string {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return value;
  }
  return '';
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function readIssue(body: unknown): string {
  if (!body || typeof body !== 'object') return 'PAYPAL_REJECTED';
  const details = (body as Record<string, unknown>).details;
  if (Array.isArray(details) && details[0] && typeof details[0] === 'object') {
    const issue = (details[0] as Record<string, unknown>).issue;
    if (typeof issue === 'string') return issue;
  }
  const name = (body as Record<string, unknown>).name;
  return typeof name === 'string' ? name : 'PAYPAL_REJECTED';
}
