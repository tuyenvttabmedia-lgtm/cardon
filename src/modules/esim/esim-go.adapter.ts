import { ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ESIM_LIVE_HTTP_DISABLED } from './esim.constants';
import {
  EsimBundleDetail,
  EsimBundleSummary,
  EsimConsumptionPrice,
  EsimOrderRequest,
  EsimOrderResult,
  EsimProviderPort,
} from './esim-provider.port';

export interface EsimHttpRequest {
  method: 'GET' | 'POST';
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface EsimHttpResponse {
  status: number;
  body: string;
}

export interface EsimHttpTransport {
  send(request: EsimHttpRequest): Promise<EsimHttpResponse>;
}

export interface EsimGoCredentialSource {
  resolveEsimGoCredentials(): { apiKey: string; baseUrl: string };
}

export interface EsimGoAdapterOptions {
  baseUrl?: string;
  apiKey?: string;
  httpEnabled?: boolean;
  transport?: EsimHttpTransport;
  credentials?: EsimGoCredentialSource;
}

export class EsimGoRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'EsimGoRequestError';
  }
}

const DEFAULT_BASE_URL = 'https://api.esim-go.com/v2.5';

export class FetchEsimTransport implements EsimHttpTransport {
  async send(request: EsimHttpRequest): Promise<EsimHttpResponse> {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });
    return { status: response.status, body: await response.text() };
  }
}

export function esimGoHttpEnabled(liveArm: boolean, apiKey: string): boolean {
  return liveArm === true && apiKey.trim() !== '';
}

export function createEsimGoAdapter(config: ConfigService): EsimGoAdapter {
  const apiKey = config.get<string>('esimGo.apiKey') ?? '';
  const configuredBase = config.get<string>('esimGo.baseUrl');
  const httpEnabled = esimGoHttpEnabled(config.get<boolean>('esim.liveArm') === true, apiKey);
  return new EsimGoAdapter(config, {
    baseUrl: typeof configuredBase === 'string' && configuredBase.trim() !== '' ? configuredBase : undefined,
    apiKey,
    httpEnabled,
    transport: httpEnabled ? new FetchEsimTransport() : undefined,
  });
}

@Injectable()
export class EsimGoAdapter implements EsimProviderPort {
  private readonly baseUrl: string;
  private readonly optionApiKey: string;
  private readonly httpEnabled: boolean;
  private readonly transport?: EsimHttpTransport;
  private readonly credentials?: EsimGoCredentialSource;
  private readonly config?: ConfigService;

  constructor(config?: ConfigService, @Optional() options?: EsimGoAdapterOptions) {
    const configuredBase = config?.get<string>('esimGo.baseUrl');
    const baseUrl = options?.baseUrl
      ?? (typeof configuredBase === 'string' && configuredBase.trim() !== '' ? configuredBase : undefined)
      ?? DEFAULT_BASE_URL;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.optionApiKey = options?.apiKey ?? '';
    this.config = config;
    this.httpEnabled = options?.httpEnabled === true;
    this.transport = options?.transport;
    this.credentials = options?.credentials;
  }

  /** Admin catalogue read. Does not place an order and does not require the live arm. */
  previewCatalogue(): Promise<{ count: number; names: string[] }> {
    return this.sendRead('GET', '/catalogue').then((body) => {
      const bundles = this.readBundles(body);
      return { count: bundles.length, names: bundles.slice(0, 20).map((bundle) => bundle.name) };
    });
  }

  getInstallDetails(orderReference: string): Promise<EsimOrderResult> {
    const reference = orderReference.trim();
    return this.send(
      'GET',
      `/esims/assignments?reference=${encodeURIComponent(reference)}`,
    ).then((body) => this.readInstallDetails(body));
  }

  listBundles(): Promise<EsimBundleSummary[]> {
    return this.send('GET', '/catalogue').then((body) => this.readBundles(body));
  }

  getBundle(name: string): Promise<EsimBundleDetail> {
    return this.send('GET', `/catalogue/bundle/${encodeURIComponent(name)}`).then((parsed) => {
      const record = parsed && typeof parsed === 'object' ? (parsed as { name?: unknown; description?: unknown }) : {};
      return {
        name: typeof record.name === 'string' ? record.name : name,
        description: typeof record.description === 'string' ? record.description : undefined,
        raw: parsed,
      };
    });
  }

  listPrices(): Promise<EsimConsumptionPrice[]> {
    return this.send('GET', '/catalogue/prices').then((body) => this.readPrices(body));
  }

  validateOrder(input: EsimOrderRequest): Promise<EsimOrderResult> {
    return this.submitOrder('validate', input);
  }

  createOrder(input: EsimOrderRequest): Promise<EsimOrderResult> {
    return this.submitOrder('transaction', input);
  }

  getOrder(orderReference: string): Promise<EsimOrderResult> {
    return this.send('GET', `/orders/${encodeURIComponent(orderReference)}`).then((body) =>
      this.readOrder(body),
    );
  }

  private submitOrder(type: 'validate' | 'transaction', input: EsimOrderRequest): Promise<EsimOrderResult> {
    const payload = {
      type,
      assign: input.assign === true,
      order: input.items.map((item) => ({
        type: 'bundle',
        quantity: item.quantity,
        item: item.bundleName,
      })),
    };
    return this.send('POST', '/orders', JSON.stringify(payload)).then((body) => this.readOrder(body));
  }

  private currentApiKey(): string {
    const fromSettings = this.credentials?.resolveEsimGoCredentials().apiKey.trim() ?? '';
    if (fromSettings) return fromSettings;
    if (this.optionApiKey.trim() !== '') return this.optionApiKey.trim();
    return (this.config?.get<string>('esimGo.apiKey') ?? '').trim();
  }

  private ordersEnabled(): boolean {
    if (this.credentials) {
      return this.config?.get<boolean>('esim.liveArm') === true && this.currentApiKey() !== '';
    }
    return this.httpEnabled;
  }

  private async send(method: 'GET' | 'POST', path: string, body?: string): Promise<unknown> {
    if (!this.ordersEnabled() || !this.transport) {
      throw new ForbiddenException(ESIM_LIVE_HTTP_DISABLED);
    }
    return this.dispatch(this.transport, method, path, body);
  }

  private async sendRead(method: 'GET', path: string): Promise<unknown> {
    const transport = this.transport ?? new FetchEsimTransport();
    return this.dispatch(transport, method, path);
  }

  private async dispatch(
    transport: EsimHttpTransport,
    method: 'GET' | 'POST',
    path: string,
    body?: string,
  ): Promise<unknown> {
    const apiKey = this.currentApiKey();
    if (apiKey === '') {
      throw new EsimGoRequestError('eSIM Go API key is not configured');
    }
    const response = await transport.send({
      method,
      url: `${this.baseUrl}${path}`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new EsimGoRequestError(this.safeStatusMessage(response.status), response.status);
    }
    return this.readJson(response.body);
  }

  private safeStatusMessage(status: number): string {
    return `eSIM Go request failed with status ${status}`;
  }

  private readJson(body: string): unknown {
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new EsimGoRequestError('eSIM Go response was not valid JSON');
    }
  }

  private readBundles(body: unknown): EsimBundleSummary[] {
    const list = this.bundleList(body);
    return list.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || typeof (entry as { name?: unknown }).name !== 'string') {
        return [];
      }
      const record = entry as { name: string; description?: unknown };
      return [{
        name: record.name,
        description: typeof record.description === 'string' ? record.description : undefined,
      }];
    });
  }

  private bundleList(body: unknown): unknown[] {
    if (Array.isArray(body)) return body;
    if (body && typeof body === 'object' && Array.isArray((body as { bundles?: unknown }).bundles)) {
      return (body as { bundles: unknown[] }).bundles;
    }
    throw new EsimGoRequestError('eSIM Go catalogue response was not a list');
  }

  private readPrices(body: unknown): EsimConsumptionPrice[] {
    const prices = body && typeof body === 'object' ? (body as { prices?: unknown }).prices : undefined;
    if (!Array.isArray(prices)) {
      throw new EsimGoRequestError('eSIM Go price response was not a price list');
    }
    const rows: EsimConsumptionPrice[] = [];
    for (const countryEntry of prices) {
      if (!countryEntry || typeof countryEntry !== 'object') continue;
      const country = (countryEntry as { country?: { iso?: unknown } }).country;
      const countryIso = typeof country?.iso === 'string' ? country.iso : undefined;
      const nested = (countryEntry as { prices?: unknown }).prices;
      if (!Array.isArray(nested)) continue;
      for (const price of nested) {
        if (!price || typeof price !== 'object') continue;
        const record = price as { currency?: unknown; price?: unknown; profile?: unknown };
        rows.push({
          countryIso,
          currency: typeof record.currency === 'string' ? record.currency : undefined,
          price: typeof record.price === 'string' ? record.price : undefined,
          profile: typeof record.profile === 'string' ? record.profile : undefined,
        });
      }
    }
    return rows;
  }

  private readOrder(body: unknown): EsimOrderResult {
    if (!body || typeof body !== 'object') {
      throw new EsimGoRequestError('eSIM Go order response was empty');
    }
    const record = body as {
      orderReference?: unknown;
      status?: unknown;
      currency?: unknown;
      total?: unknown;
    };
    return {
      orderReference: typeof record.orderReference === 'string' ? record.orderReference : undefined,
      status: typeof record.status === 'string' ? record.status : undefined,
      currency: typeof record.currency === 'string' ? record.currency : undefined,
      total: typeof record.total === 'number' ? record.total : undefined,
      installSecret: this.readInstallSecret(body),
    };
  }

  private readInstallDetails(body: unknown): EsimOrderResult {
    const records = Array.isArray(body) ? body : [body];
    for (const entry of records) {
      if (!entry || typeof entry !== 'object') continue;
      const record = entry as { matchingId?: unknown; smdpAddress?: unknown };
      const installSecret = buildLpa(record.smdpAddress, record.matchingId);
      if (installSecret) return { installSecret };
    }
    return {};
  }

  private readInstallSecret(body: object): string | undefined {
    const order = (body as { order?: unknown }).order;
    if (!Array.isArray(order)) return undefined;
    for (const item of order) {
      if (!item || typeof item !== 'object') continue;
      const esims = (item as { esims?: unknown }).esims;
      if (!Array.isArray(esims)) continue;
      for (const esim of esims) {
        if (!esim || typeof esim !== 'object') continue;
        const record = esim as { matchingId?: unknown; smdpAddress?: unknown };
        const secret = buildLpa(record.smdpAddress, record.matchingId);
        if (secret) return secret;
      }
    }
    return undefined;
  }
}

export function buildLpa(smdpAddress: unknown, matchingId: unknown): string | undefined {
  if (typeof smdpAddress !== 'string' || typeof matchingId !== 'string') return undefined;
  const host = smdpAddress.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
  const match = matchingId.trim();
  if (!host || host.length > 253 || !/^[A-Za-z0-9.-]+$/.test(host)) return undefined;
  if (!match || match.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(match)) return undefined;
  return `LPA:1$${host}$${match}`;
}
