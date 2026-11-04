import { ForbiddenException, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { airaloGetPaths } from './esim-airalo-code';
import { ESIM_LIVE_HTTP_DISABLED } from './esim.constants';
import {
  detectFupClear,
  inferDestinationKey,
  parseDataAmountMb,
  readMoney,
} from './esim-catalogue.rules';
import {
  EsimBundleDetail,
  EsimBundleSummary,
  EsimConsumptionPrice,
  EsimOrderRequest,
  EsimOrderResult,
  EsimProviderPort,
} from './esim-provider.port';

export interface AiraloCataloguePackage {
  providerPackageId: string;
  countryIso: string;
  destinationKey: string;
  operatorTitle: string;
  title: string;
  packageType: string;
  validityDays: number;
  dataAmountMb: number;
  isUnlimited: boolean;
  fupClear: boolean;
  netPriceVnd: number | null;
  netPriceUsd: number | null;
  retailPriceVnd: number | null;
  retailPriceUsd: number | null;
  countries: string[];
  shortInfo: string;
  operatorInfo: string[];
  otherInfo: string;
  countryImageUrl: string;
  operatorImageUrl: string;
  activationPolicy: string;
  apnType: string;
  apnValue: string;
  isRoaming: boolean;
  rechargeable: boolean;
  planType: string;
  networks: string[];
  networkTypes: string[];
  fairUsagePolicy: string;
}

export interface AiraloHttpRequest {
  method: 'GET' | 'POST';
  url: string;
  headers: Record<string, string>;
  body?: string | FormData;
}

export interface AiraloHttpResponse {
  status: number;
  body: string;
}

export interface AiraloHttpTransport {
  send(request: AiraloHttpRequest): Promise<AiraloHttpResponse>;
}

export interface AiraloCredentialSource {
  resolveAiraloCredentials(): { clientId: string; clientSecret: string; baseUrl: string };
}

export interface EsimAiraloAdapterOptions {
  baseUrl?: string;
  clientId?: string;
  clientSecret?: string;
  httpEnabled?: boolean;
  transport?: AiraloHttpTransport;
  credentials?: AiraloCredentialSource;
}

export class AiraloRequestError extends Error {
  readonly airaloCode?: number;
  readonly field?: string;

  constructor(
    message: string,
    readonly status?: number,
    extras?: { airaloCode?: number; field?: string },
  ) {
    super(message);
    this.name = 'AiraloRequestError';
    this.airaloCode = extras?.airaloCode;
    this.field = extras?.field;
  }
}

const DEFAULT_BASE_URL = 'https://partners-api.airalo.com';

export class FetchAiraloTransport implements AiraloHttpTransport {
  async send(request: AiraloHttpRequest): Promise<AiraloHttpResponse> {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });
    return { status: response.status, body: await response.text() };
  }
}

export function airaloHttpEnabled(liveArm: boolean, clientId: string, clientSecret: string): boolean {
  return liveArm === true && clientId.trim() !== '' && clientSecret.trim() !== '';
}

@Injectable()
export class EsimAiraloAdapter implements EsimProviderPort {
  private readonly logger = new Logger(EsimAiraloAdapter.name);
  private readonly baseUrl: string;
  private readonly optionClientId: string;
  private readonly optionClientSecret: string;
  private readonly httpEnabled: boolean;
  private readonly transport?: AiraloHttpTransport;
  private readonly credentials?: AiraloCredentialSource;
  private readonly config?: ConfigService;
  private cachedToken: { value: string; expiresAtMs: number } | null = null;
  private tokenInFlight: Promise<string> | null = null;

  constructor(config?: ConfigService, @Optional() options?: EsimAiraloAdapterOptions) {
    const configuredBase = config?.get<string>('airalo.baseUrl');
    const baseUrl =
      options?.baseUrl ??
      (typeof configuredBase === 'string' && configuredBase.trim() !== '' ? configuredBase : undefined) ??
      DEFAULT_BASE_URL;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.optionClientId = options?.clientId ?? '';
    this.optionClientSecret = options?.clientSecret ?? '';
    this.config = config;
    this.httpEnabled = options?.httpEnabled === true;
    this.transport = options?.transport;
    this.credentials = options?.credentials;
  }

  listBundles(): Promise<EsimBundleSummary[]> {
    return this.listCataloguePackages().then((packages) =>
      packages.map((pkg) => ({ name: pkg.providerPackageId, description: pkg.title })),
    );
  }

  async listCataloguePackages(): Promise<AiraloCataloguePackage[]> {
    const out: AiraloCataloguePackage[] = [];
    let page = 1;
    let lastPage = 1;
    do {
      const body = await this.send('GET', `/v2/packages?limit=100&page=${page}&language=vi`);
      out.push(...parseAiraloCataloguePage(body));
      lastPage = readAiraloLastPage(body);
      page += 1;
    } while (page <= lastPage && page <= 50);
    return out;
  }

  getBundle(name: string): Promise<EsimBundleDetail> {
    return this.listBundles().then((bundles) => {
      const found = bundles.find((bundle) => bundle.name === name);
      if (!found) {
        throw new AiraloRequestError(`Airalo package not found: ${name}`);
      }
      return { name: found.name, description: found.description, raw: found };
    });
  }

  /** Airalo has no eSIM-Go-style consumption price list. Bundle net price comes from packages. */
  listPrices(): Promise<EsimConsumptionPrice[]> {
    return Promise.resolve([]);
  }

  validateOrder(input: EsimOrderRequest): Promise<EsimOrderResult> {
    const packageId = input.items[0]?.bundleName?.trim();
    if (!packageId) {
      throw new AiraloRequestError('Airalo package_id is required');
    }
    return this.getBundle(packageId).then((bundle) => ({
      orderReference: undefined,
      status: 'validated',
      installSecret: undefined,
      currency: undefined,
      total: undefined,
      // keep shape; callers must not treat this as a live order
      ...(bundle ? {} : {}),
    }));
  }

  createOrder(input: EsimOrderRequest): Promise<EsimOrderResult> {
    const packageId = input.items[0]?.bundleName?.trim();
    const quantity = input.items[0]?.quantity ?? 1;
    if (!packageId) {
      throw new AiraloRequestError('Airalo package_id is required');
    }
    const body = new FormData();
    body.set('package_id', packageId);
    body.set('quantity', String(Math.max(1, Math.min(50, quantity))));
    body.set('type', 'sim');
    return this.send('POST', '/v2/orders', body).then((parsed) => {
      const result = this.readOrder(parsed);
      this.logger.log(
        `Airalo CREATE parsed ref=${result.orderReference ?? 'none'} hasLpa=${Boolean(result.installSecret)}`,
      );
      return result;
    });
  }

  getOrder(orderReference: string): Promise<EsimOrderResult> {
    const paths = airaloGetPaths(orderReference);
    if (paths.length === 0) {
      return Promise.reject(new AiraloRequestError('Airalo GET order reference was empty'));
    }
    return this.sendFirst(paths).then((body) => this.readOrder(body));
  }

  getInstallDetails(orderReference: string): Promise<EsimOrderResult> {
    return this.getOrder(orderReference);
  }

  private currentBaseUrl(): string {
    if (this.credentials) {
      const fromSettings = this.credentials.resolveAiraloCredentials();
      if (fromSettings.baseUrl.trim()) {
        return fromSettings.baseUrl.replace(/\/$/, '');
      }
    }
    return this.baseUrl;
  }

  private currentCredentials(): { clientId: string; clientSecret: string } {
    if (this.credentials) {
      const fromSettings = this.credentials.resolveAiraloCredentials();
      if (fromSettings.clientId.trim() && fromSettings.clientSecret.trim()) {
        return {
          clientId: fromSettings.clientId.trim(),
          clientSecret: fromSettings.clientSecret.trim(),
        };
      }
    }
    if (this.optionClientId.trim() && this.optionClientSecret.trim()) {
      return { clientId: this.optionClientId.trim(), clientSecret: this.optionClientSecret.trim() };
    }
    return {
      clientId: (this.config?.get<string>('airalo.clientId') ?? '').trim(),
      clientSecret: (this.config?.get<string>('airalo.clientSecret') ?? '').trim(),
    };
  }

  private ordersEnabled(): boolean {
    const { clientId, clientSecret } = this.currentCredentials();
    if (this.credentials) {
      return this.config?.get<boolean>('esim.liveArm') === true && clientId !== '' && clientSecret !== '';
    }
    return this.httpEnabled;
  }

  private async sendFirst(paths: string[]): Promise<unknown> {
    let lastError: unknown;
    for (const path of paths) {
      try {
        return await this.send('GET', path);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new AiraloRequestError('Airalo GET order failed');
  }

  private async send(
    method: 'GET' | 'POST',
    path: string,
    body?: string | FormData,
    contentType = 'application/json',
    retriedAuth = false,
  ): Promise<unknown> {
    if (!this.ordersEnabled() || !this.transport) {
      throw new ForbiddenException(ESIM_LIVE_HTTP_DISABLED);
    }
    const token = await this.accessToken(this.transport);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Accept-Language': 'vi',
      Authorization: `Bearer ${token}`,
    };
    if (typeof body === 'string') {
      headers['Content-Type'] = contentType;
    }
    const response = await this.transport.send({
      method,
      url: `${this.currentBaseUrl()}${path}`,
      headers,
      body,
    });
    const pathname = path.split('?')[0];
    if (
      response.status === 401 &&
      method === 'GET' &&
      pathname !== '/v2/token' &&
      !retriedAuth
    ) {
      this.clearTokenCache();
      return this.send(method, path, body, contentType, true);
    }
    if (response.status < 200 || response.status >= 300) {
      const parsed = parseAiraloErrorBody(response.body);
      throw new AiraloRequestError(this.safeStatusMessage(response.status, response.body), response.status, parsed);
    }
    return this.readJson(response.body);
  }

  private async accessToken(transport: AiraloHttpTransport): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAtMs > now + 60_000) {
      return this.cachedToken.value;
    }
    if (this.tokenInFlight) {
      return this.tokenInFlight;
    }
    this.tokenInFlight = this.fetchAccessToken(transport, now).finally(() => {
      this.tokenInFlight = null;
    });
    return this.tokenInFlight;
  }

  private clearTokenCache(): void {
    this.cachedToken = null;
    this.tokenInFlight = null;
  }

  private async fetchAccessToken(transport: AiraloHttpTransport, now: number): Promise<string> {
    const { clientId, clientSecret } = this.currentCredentials();
    if (!clientId || !clientSecret) {
      throw new AiraloRequestError('Airalo client credentials are not configured');
    }
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    });
    const response = await transport.send({
      method: 'POST',
      url: `${this.currentBaseUrl()}/v2/token`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    if (response.status < 200 || response.status >= 300) {
      const parsedError = parseAiraloErrorBody(response.body);
      throw new AiraloRequestError(
        this.safeStatusMessage(response.status, response.body),
        response.status,
        parsedError,
      );
    }
    const parsed = this.readJson(response.body);
    const data =
      parsed && typeof parsed === 'object' ? (parsed as { data?: { access_token?: unknown; expires_in?: unknown } }).data : undefined;
    const token = typeof data?.access_token === 'string' ? data.access_token : '';
    if (!token) {
      throw new AiraloRequestError('Airalo token response was empty');
    }
    const expiresIn = Number(data?.expires_in);
    const ttlSec = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 86_400;
    this.cachedToken = { value: token, expiresAtMs: now + ttlSec * 1000 };
    return token;
  }

  private safeStatusMessage(status: number, body?: string): string {
    const detail = readAiraloErrorDetail(body);
    return detail ? `Airalo request failed with status ${status} (${detail})` : `Airalo request failed with status ${status}`;
  }

  private readJson(body: string): unknown {
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new AiraloRequestError('Airalo response was not valid JSON');
    }
  }

  private readPackages(body: unknown): EsimBundleSummary[] {
    return parseAiraloCataloguePage(body).map((pkg) => ({
      name: pkg.providerPackageId,
      description: pkg.title,
    }));
  }

  private readOrder(body: unknown): EsimOrderResult {
    const data = unwrapAiraloOrder(body);
    if (!data) {
      throw new AiraloRequestError('Airalo order response was empty');
    }
    const id = data.id;
    const code = typeof data.code === 'string' ? data.code.trim() : '';
    const providerOrderId =
      typeof id === 'number' || typeof id === 'string' ? String(id).trim() || undefined : undefined;
    const providerOrderCode = code || undefined;
    const orderReference = providerOrderCode || providerOrderId;
    const sims = Array.isArray(data.sims) ? data.sims : [];
    let installSecret: string | undefined;
    for (const sim of sims) {
      installSecret = readAiraloInstallSecret(sim);
      if (installSecret) break;
    }
    return {
      orderReference,
      providerOrderId,
      providerOrderCode,
      status: readAiraloOrderStatus(data.status),
      currency: typeof data.currency === 'string' ? data.currency : undefined,
      total: typeof data.price === 'number' ? data.price : undefined,
      installSecret,
    };
  }
}

/**
 * Airalo `lpa` is the SM-DP+ host, `matching_id` is the activation code,
 * and `qrcode` is the full `LPA:1$host$id` string. Do not treat `lpa` as the install secret.
 */
export function readAiraloInstallSecret(sim: unknown): string | undefined {
  if (!sim || typeof sim !== 'object') return undefined;
  const record = sim as {
    qrcode?: unknown;
    lpa?: unknown;
    matching_id?: unknown;
    matchingId?: unknown;
  };
  const qrcode = stringOrEmpty(record.qrcode);
  if (qrcode.startsWith('LPA:1$')) return qrcode;
  const hostOrSecret = stringOrEmpty(record.lpa);
  if (hostOrSecret.startsWith('LPA:1$')) return hostOrSecret;
  const matchingId = stringOrEmpty(record.matching_id ?? record.matchingId);
  if (hostOrSecret && matchingId) return `LPA:1$${hostOrSecret}$${matchingId}`;
  return undefined;
}

export function unwrapAiraloOrder(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object') return null;
  const raw = (body as { data?: unknown }).data ?? body;
  const row = Array.isArray(raw) ? raw[0] : raw;
  return row && typeof row === 'object' && !Array.isArray(row)
    ? (row as Record<string, unknown>)
    : null;
}

export function readAiraloOrderStatus(status: unknown): string {
  if (typeof status === 'string' && status.trim()) return status.trim();
  if (status && typeof status === 'object') {
    const slug = (status as { slug?: unknown; name?: unknown }).slug
      ?? (status as { name?: unknown }).name;
    if (typeof slug === 'string' && slug.trim()) return slug.trim();
  }
  return 'completed';
}

const UNSAFE_AIRALO_ERROR = /LPA:1\$|Bearer\s+|client_secret|access_token|qrcode=|matching_id=/i;
const AIRALO_ERROR_FIELDS = [
  'package_id',
  'quantity',
  'limit',
  'page',
  'type',
  'brand_settings_name',
  'filter.type',
  'filter.country',
] as const;

export interface AiraloParsedError {
  airaloCode?: number;
  field?: string;
}

function sanitizeAiraloErrorMessage(message: string): string {
  if (!message || message.length > 120 || UNSAFE_AIRALO_ERROR.test(message)) {
    return '';
  }
  return message;
}

export function parseAiraloErrorBody(body?: string): AiraloParsedError | undefined {
  if (!body) return undefined;
  try {
    const parsed = JSON.parse(body) as {
      code?: unknown;
      reason?: unknown;
      data?: unknown;
      meta?: { message?: unknown; code?: unknown };
    };
    const topCode = Number(parsed.code);
    const metaCode = Number(parsed.meta?.code);
    const airaloCode = Number.isInteger(topCode) ? topCode : Number.isInteger(metaCode) ? metaCode : undefined;
    let field: string | undefined;
    if (parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)) {
      for (const key of AIRALO_ERROR_FIELDS) {
        if (key in (parsed.data as Record<string, unknown>)) {
          field = key;
          break;
        }
      }
    }
    return airaloCode !== undefined || field ? { airaloCode, field } : undefined;
  } catch {
    return undefined;
  }
}

function readAiraloErrorDetail(body?: string): string | undefined {
  if (!body) return undefined;
  try {
    const parsed = JSON.parse(body) as {
      code?: unknown;
      reason?: unknown;
      data?: unknown;
      meta?: { message?: unknown; code?: unknown };
    };
    const extras = parseAiraloErrorBody(body);
    const reason =
      typeof parsed.reason === 'string' ? sanitizeAiraloErrorMessage(parsed.reason.trim()) : '';
    const message =
      typeof parsed.meta?.message === 'string' ? sanitizeAiraloErrorMessage(parsed.meta.message.trim()) : '';
    const fieldMessage =
      extras?.field && parsed.data && typeof parsed.data === 'object'
        ? sanitizeAiraloErrorMessage(String((parsed.data as Record<string, unknown>)[extras.field] ?? ''))
        : '';
    const parts = [
      extras?.airaloCode !== undefined ? `code ${extras.airaloCode}` : '',
      extras?.field ? `field=${extras.field}` : '',
      reason,
      fieldMessage,
      message,
    ].filter(Boolean);
    return parts.length ? parts.join(' ') : undefined;
  } catch {
    return undefined;
  }
}

export function readAiraloLastPage(body: unknown): number {
  if (!body || typeof body !== 'object') return 1;
  const meta = (body as { meta?: { last_page?: unknown } }).meta;
  const last = Number(meta?.last_page);
  return Number.isFinite(last) && last >= 1 ? Math.floor(last) : 1;
}

export function parseAiraloCataloguePage(body: unknown): AiraloCataloguePackage[] {
  const countries = packageCountries(body);
  const out: AiraloCataloguePackage[] = [];
  for (const country of countries) {
    if (!country || typeof country !== 'object') continue;
    const countryRecord = country as {
      country_code?: unknown;
      slug?: unknown;
      title?: unknown;
      image?: unknown;
      operators?: unknown;
    };
    const countryIso = stringOrEmpty(countryRecord.country_code || countryRecord.slug).toUpperCase();
    const countryImageUrl = readImageUrl(countryRecord.image);
    const operators = Array.isArray(countryRecord.operators) ? countryRecord.operators : [];
    for (const operator of operators) {
      if (!operator || typeof operator !== 'object') continue;
      const operatorRecord = operator as Record<string, unknown>;
      const operatorTitle = stringOrEmpty(operatorRecord.title) || 'Airalo';
      const operatorInfo = readStringList(operatorRecord.info);
      const otherInfo = stringOrEmpty(operatorRecord.other_info);
      const operatorCountries = readCountryCodes(operatorRecord.countries);
      const networks = readNetworks(operatorRecord.coverages ?? operatorRecord.networks);
      const networkTypes = uniqueStrings([
        ...readStringList(operatorRecord.types),
        ...networks.types,
      ]);
      const packages = Array.isArray(operatorRecord.packages) ? operatorRecord.packages : [];
      for (const pkg of packages) {
        if (!pkg || typeof pkg !== 'object') continue;
        const record = pkg as Record<string, unknown>;
        const id = stringOrEmpty(record.id ?? record.package_id);
        if (!id) continue;
        const title = stringOrEmpty(record.title);
        const packageType = stringOrEmpty(record.type) || 'sim';
        const isUnlimited = record.is_unlimited === true;
        const fairUsagePolicy = stringOrEmpty(record.fair_usage_policy ?? operatorRecord.fair_usage_policy);
        const shortInfo = stringOrEmpty(record.short_info);
        const fupSource = [title, shortInfo, otherInfo, ...operatorInfo, fairUsagePolicy].join(' ');
        const countries = uniqueCodes([countryIso, ...operatorCountries, ...readCountryCodes(record.countries)]);
        const destinationKey = inferDestinationKey({
          countryIso,
          countries,
          packageType,
          title,
        });
        const prices =
          record.prices && typeof record.prices === 'object'
            ? (record.prices as {
                net_price?: unknown;
                price?: unknown;
                recommended_retail_price?: unknown;
              })
            : undefined;
        const netPrice = (prices?.net_price ?? record.net_price) as Record<string, unknown> | undefined;
        const retailPrice = (prices?.recommended_retail_price ??
          record.recommended_retail_price) as Record<string, unknown> | undefined;
        out.push({
          providerPackageId: id,
          countryIso: countryIso || countries[0] || destinationKey.toUpperCase(),
          destinationKey,
          operatorTitle,
          title: title || id,
          packageType,
          validityDays: Number.isFinite(Number(record.day)) ? Number(record.day) : 0,
          dataAmountMb: parseDataAmountMb(record.amount, record.data, isUnlimited),
          isUnlimited,
          fupClear: isUnlimited ? detectFupClear(fupSource) || Boolean(fairUsagePolicy) : true,
          netPriceVnd: readMoney(netPrice?.VND ?? netPrice?.vnd),
          netPriceUsd: readMoney(netPrice?.USD ?? netPrice?.usd ?? record.price ?? prices?.price),
          retailPriceVnd: readMoney(retailPrice?.VND ?? retailPrice?.vnd),
          retailPriceUsd: readMoney(retailPrice?.USD ?? retailPrice?.usd),
          countries,
          shortInfo,
          operatorInfo,
          otherInfo,
          countryImageUrl,
          operatorImageUrl: readImageUrl(operatorRecord.image),
          activationPolicy: stringOrEmpty(operatorRecord.activation_policy),
          apnType: stringOrEmpty(operatorRecord.apn_type ?? record.apn_type),
          apnValue: stringOrEmpty(operatorRecord.apn_value ?? record.apn_value),
          isRoaming: operatorRecord.is_roaming === true,
          rechargeable: operatorRecord.rechargeability === true,
          planType: stringOrEmpty(operatorRecord.plan_type) || 'data',
          networks: networks.names,
          networkTypes,
          fairUsagePolicy,
        });
      }
    }
  }
  return out;
}

function packageCountries(body: unknown): unknown[] {
  if (body && typeof body === 'object' && Array.isArray((body as { data?: unknown }).data)) {
    return (body as { data: unknown[] }).data;
  }
  if (Array.isArray(body)) return body;
  throw new AiraloRequestError('Airalo packages response was not a list');
}

function stringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readCountryCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) {
      out.push(item.trim().toUpperCase());
      continue;
    }
    if (item && typeof item === 'object') {
      const code = stringOrEmpty((item as { country_code?: unknown; iso?: unknown }).country_code
        ?? (item as { iso?: unknown }).iso);
      if (code) out.push(code.toUpperCase());
    }
  }
  return out;
}

function uniqueCodes(codes: string[]): string[] {
  return [...new Set(codes.map((code) => code.trim().toUpperCase()).filter(Boolean))];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function readImageUrl(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const url = stringOrEmpty((value as { url?: unknown }).url);
  return url.startsWith('https://') ? url : '';
}

function readStringList(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.map((item) => stringOrEmpty(item)).filter(Boolean);
}

function readNetworks(value: unknown): { names: string[]; types: string[] } {
  if (!Array.isArray(value)) return { names: [], types: [] };
  const names: string[] = [];
  const types: string[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const record = item as { name?: unknown; networks?: unknown; types?: unknown };
    const nested = Array.isArray(record.networks) ? record.networks : [item];
    for (const network of nested) {
      if (!network || typeof network !== 'object') continue;
      const row = network as { name?: unknown; types?: unknown };
      const name = stringOrEmpty(row.name);
      if (name) names.push(name);
      types.push(...readStringList(row.types));
    }
  }
  return { names: uniqueStrings(names), types: uniqueStrings(types) };
}
