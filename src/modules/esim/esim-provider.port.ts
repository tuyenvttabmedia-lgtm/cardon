export const ESIM_PROVIDER_PORT = Symbol('ESIM_PROVIDER_PORT');

export interface EsimBundleSummary {
  name: string;
  description?: string;
}

export interface EsimBundleDetail extends EsimBundleSummary {
  raw: unknown;
}

/** Country consumption price from GET /catalogue/prices. Not a bundle wholesale cost. */
export interface EsimConsumptionPrice {
  countryIso?: string;
  currency?: string;
  price?: string;
  profile?: string;
}

export interface EsimOrderItemRequest {
  bundleName: string;
  quantity: number;
}

export interface EsimOrderRequest {
  items: EsimOrderItemRequest[];
  assign?: boolean;
}

export interface EsimOrderResult {
  orderReference?: string;
  /** Airalo numeric `data.id`. Used for GET /v2/orders/{id}. */
  providerOrderId?: string;
  /** Airalo `data.code` (often YYYYMMDD-id). Used for list filter[code]. */
  providerOrderCode?: string;
  status?: string;
  currency?: string;
  total?: number;
  /** LPA install string built from SM-DP+ address and matching id. No PIN or PUK. */
  installSecret?: string;
}

export interface EsimProviderPort {
  listBundles(): Promise<EsimBundleSummary[]>;
  getBundle(name: string): Promise<EsimBundleDetail>;
  listPrices(): Promise<EsimConsumptionPrice[]>;
  validateOrder(input: EsimOrderRequest): Promise<EsimOrderResult>;
  createOrder(input: EsimOrderRequest): Promise<EsimOrderResult>;
  getOrder(orderReference: string): Promise<EsimOrderResult>;
  /** GET /esims/assignments. Optional so card mocks are not required to implement it. */
  getInstallDetails?(orderReference: string): Promise<EsimOrderResult>;
}
