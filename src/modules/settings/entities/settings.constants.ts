export const SETTINGS_KEYS = {
  PAYMENT_MEGAPAY: 'settings.payment.megapay',
  PAYMENT_SEPAY: 'settings.payment.sepay',
  /** @deprecated Read for migration only — use PAYMENT_STRATEGY */
  PAYMENT_RUNTIME: 'settings.payment.runtime',
  PAYMENT_STRATEGY: 'settings.payment.strategy',
  PAYMENT_GATEWAY_MEGAPAY: 'settings.payment.gateway.megapay',
  PAYMENT_GATEWAY_SEPAY: 'settings.payment.gateway.sepay',
  PAYMENT_METHODS: 'settings.payment.methods',
  PROVIDER_ESALE: 'settings.provider.esale',
  /** @deprecated eSIM Go retired — use PROVIDER_AIRALO */
  PROVIDER_ESIM_GO: 'settings.provider.esim_go',
  PROVIDER_AIRALO: 'settings.provider.airalo',
  PAYMENT_PAYPAL: 'settings.payment.paypal',
  SMTP: 'settings.smtp',
  SYSTEM: 'settings.system',
  ORDER: 'settings.order',
  TELEGRAM: 'settings.telegram',
  /** Cloudflare Turnstile — secret encrypted; site key public. */
  TURNSTILE: 'settings.security.turnstile',
  MAINTENANCE: 'settings.maintenance',
} as const;

export const SETTINGS_AUDIT_ACTION = 'SETTING_UPDATED';

export const MASKED_SECRET_PATTERN = /^\*{8}/;

export type SettingsEnvironment = 'sandbox' | 'production';

export interface StoredPaymentGateway {
  enabled?: boolean;
  environment?: SettingsEnvironment;
  /**
   * Old rows only. VietQR and Payment Gateway are stored together.
   * webhookSecretEnc is the VietQR HMAC. ipnSecretEnc is the eSIM IPN secret.
   * A payment_gateway row that has no ipnSecretEnc still keeps the IPN in webhookSecretEnc.
   */
  integrationMode?: 'legacy_qr' | 'payment_gateway';
  merchantId?: string;
  endpoint?: string;
  returnUrl?: string;
  callbackUrl?: string;
  webhookUrl?: string;
  secretKeyEnc?: string;
  /** VietQR / bank-transfer HMAC. Not the Payment Gateway IPN secret. */
  webhookSecretEnc?: string;
  /** SePay Payment Gateway IPN secret for eSIM. Never written into webhookSecretEnc. */
  ipnSecretEnc?: string;
  apiKeyEnc?: string;
  /** MegaPay DepositCode RSA public key (PEM) for notify verify */
  notifyPublicKeyEnc?: string;
  /** MegaPay PG encodeKey (V1.4.6) — separate from DepositCode 3DES key when provided */
  pgEncodeKeyEnc?: string;
  /** MegaPay PG refund password for paymentCancel.do */
  pgRefundPasswordEnc?: string;
  /** MegaPay PG merId when different from DepositCode merchantId */
  pgMerchantId?: string;
  /** MegaPay PG environment for domain/JS assets */
  pgEnvironment?: SettingsEnvironment;
  /** Public site URL for MegaPay reqDomain */
  reqDomain?: string;
  bankAccount?: string;
  bankCode?: string;
  accountName?: string;
  qrTemplate?: string;
  /** BANK_TRANSFER | NAPAS_BANK_TRANSFER for PG checkout */
  paymentMethod?: 'BANK_TRANSFER' | 'NAPAS_BANK_TRANSFER';
}

/** PAYPAL is eSIM-international only — not used by card/topup methods. */
export type PaymentMethodGateway = 'SEPAY' | 'MEGAPAY' | 'PAYPAL';

export type PaymentSettlementType =
  | 'DIRECT_TO_MERCHANT'
  | 'GATEWAY_SETTLEMENT';

export interface StoredPaymentMethod {
  gatewayCode: PaymentMethodGateway;
  methodCode: string;
  displayName: string;
  description?: string;
  iconUrl?: string | null;
  logoUrl?: string | null;
  settlementType: PaymentSettlementType;
  /** Retail card/topup checkout. */
  enabled: boolean;
  /**
   * eSIM VN lane only (MegaPay VNPAYQR / ZALOPAY). Independent of `enabled`
   * so retail can stay VietQR-only while eSIM offers wallet/QR.
   */
  esimEnabled?: boolean;
  percentageFee: number;
  fixedFee: number;
}

export const DEFAULT_PAYMENT_METHODS: StoredPaymentMethod[] = [
  {
    gatewayCode: 'SEPAY',
    methodCode: 'VIETQR',
    displayName: 'Chuyển khoản (Viet QR)',
    description: 'Chuyển khoản QR ngân hàng (Viet QR)',
    iconUrl: null,
    logoUrl: null,
    settlementType: 'DIRECT_TO_MERCHANT',
    enabled: true,
    percentageFee: 0,
    fixedFee: 300,
  },
  {
    gatewayCode: 'SEPAY',
    methodCode: 'NAPAS_247',
    displayName: 'NAPAS 247',
    description: 'QR Napas',
    iconUrl: null,
    logoUrl: null,
    settlementType: 'DIRECT_TO_MERCHANT',
    enabled: false,
    percentageFee: 0.3,
    fixedFee: 0,
  },
  {
    gatewayCode: 'MEGAPAY',
    methodCode: 'ZALOPAY',
    displayName: 'Ví điện tử ZaloPay',
    description:
      'Thanh toán qua ví ZaloPay (MegaPay payType=EW). Phí hoàn trả: 1.100đ/giao dịch.',
    iconUrl: null,
    logoUrl: null,
    settlementType: 'GATEWAY_SETTLEMENT',
    enabled: true,
    esimEnabled: false,
    percentageFee: 1.5,
    fixedFee: 1100,
  },
  {
    gatewayCode: 'MEGAPAY',
    methodCode: 'DEPOSIT_CODE',
    displayName: 'Chuyển khoản (Viet QR)',
    description:
      'Chuyển khoản Viet QR / mã nộp tiền (MegaPay PG payType=VA).',
    iconUrl: null,
    logoUrl: null,
    settlementType: 'GATEWAY_SETTLEMENT',
    enabled: true,
    esimEnabled: false,
    percentageFee: 0.77,
    fixedFee: 0,
  },
  {
    gatewayCode: 'MEGAPAY',
    methodCode: 'VNPAYQR',
    displayName: 'Chuyển khoản VNPAYQR',
    description: 'Thanh toán QR VNPAY (MegaPay payType=QR).',
    iconUrl: null,
    logoUrl: null,
    settlementType: 'GATEWAY_SETTLEMENT',
    enabled: true,
    esimEnabled: false,
    percentageFee: 0.77,
    fixedFee: 0,
  },
];

/** MegaPay methods that may be armed for eSIM VN (not DEPOSIT_CODE / VA). */
export const ESIM_MEGAPAY_METHOD_CODES = ['VNPAYQR', 'ZALOPAY'] as const;
export type EsimMegapayMethodCode = (typeof ESIM_MEGAPAY_METHOD_CODES)[number];

export function isEsimMegapayMethodCode(code: string): code is EsimMegapayMethodCode {
  return (ESIM_MEGAPAY_METHOD_CODES as readonly string[]).includes(code.trim().toUpperCase());
}

/** @deprecated eSIM Go API token. Kept for cleanup / audit of old settings only. */
export interface StoredProviderEsimGo {
  apiKeyEnc?: string;
}

/** Airalo Partner API credentials. Separate from eSale. Does not enable customer sales alone. */
export interface StoredProviderAiralo {
  clientIdEnc?: string;
  clientSecretEnc?: string;
  baseUrl?: string;
  /** Admin FX used only when Airalo V2 has no VND net_price. */
  usdVndRate?: number;
  /** Partner Platform account mode. Same API host; Production is one-way on Airalo. */
  accountMode?: 'sandbox' | 'production';
}

/** PayPal eSIM international flag + secrets. Cards/topup never read this. */
export interface StoredPaymentPaypal {
  esimEnabled?: boolean;
  clientIdEnc?: string;
  clientSecretEnc?: string;
  webhookIdEnc?: string;
  /** PayPal API mode — not MegaPay/SePay environment naming. */
  mode?: 'sandbox' | 'live';
  /** Last admin-requested probe. Never stores tokens or secrets. */
  lastProbe?: { at: string; ok: boolean; reason?: string };
}

export interface StoredProviderEsale {
  enabled?: boolean;
  environment?: SettingsEnvironment;
  cardApiUrl?: string;
  topupApiUrl?: string;
  agencyCode?: string;
  clientCode?: string;
  secretKeyEnc?: string;
  privateKeyEnc?: string;
  publicKeyEnc?: string;
  timeoutMs?: number;
}

export interface StoredSmtp {
  enabled?: boolean;
  host?: string;
  port?: number;
  username?: string;
  passwordEnc?: string;
  from?: string;
  fromName?: string;
  secure?: boolean;
}

export interface StoredSystem {
  siteName?: string;
  publicUrl?: string;
  providerLowBalanceThreshold?: number;
  agentLowBalanceThreshold?: number;
  agentRegistrationMode?: 'INVITE_ONLY' | 'PUBLIC_APPROVAL' | 'DISABLED';
  customerTopupEnabled?: boolean;
  customerDataEnabled?: boolean;
  /** eSIM storefront. Default false. Does not enable a live provider. */
  customerEsimEnabled?: boolean;
  /**
   * Max charge_amount per eSIM order in VND (SePay). Default 2_000_000.
   * 0 = disabled. Invalid/missing values must fall back to default — never treat as 0.
   */
  esimMaxChargeAmountVnd?: number;
  /**
   * Max charge_amount per eSIM order in USD (PayPal). Default 80. Absolute hard max 80.
   * 0 = disable admin setting (hard cap 80 still applies). Invalid / >80 → default 80.
   */
  esimMaxChargeAmountUsd?: number;
  /** Days to keep system_audit_logs + audit_logs. Default 360. */
  auditLogRetentionDays?: number;
  /** Min VND per agent deposit transaction (Admin override). */
  agentDepositMinAmount?: number;
  /** Max VND per agent deposit transaction (Admin override). */
  agentDepositMaxAmount?: number;
}

/** Default / bounds for audit log retention (Admin → Cấu hình hệ thống). */
export const AUDIT_LOG_RETENTION_DAYS_DEFAULT = 360;
export const AUDIT_LOG_RETENTION_DAYS_MIN = 30;
export const AUDIT_LOG_RETENTION_DAYS_MAX = 3650;

export interface StoredOrder {
  guestMaxOrderAmount?: number;
  customerMaxOrderAmount?: number;
}

export interface StoredTelegram {
  enabled?: boolean;
  botTokenEnc?: string;
  chatId?: string;
}

/** Admin-managed Turnstile. Secret AES-encrypted; site key plain (public). */
export interface StoredTurnstile {
  enabled?: boolean;
  siteKey?: string;
  secretKeyEnc?: string;
  /** CSV hostnames for siteverify allowlist, e.g. cardon.vn,www.cardon.vn */
  allowedHostnames?: string;
}

export type MaintenanceMode = 'OFF' | 'READ_ONLY' | 'MAINTENANCE' | 'EMERGENCY';

export type MaintenanceModuleKey =
  | 'products'
  | 'orders'
  | 'payment'
  | 'topup'
  | 'data'
  | 'game_cards'
  | 'marketing'
  | 'partner_api'
  | 'customer_api'
  | 'public_api';

export interface MaintenanceBannerConfig {
  title?: string;
  description?: string;
  icon?: string;
  color?: string;
  buttonText?: string;
  buttonLink?: string;
  startAt?: string | null;
  endAt?: string | null;
}

export interface MaintenanceScheduleConfig {
  startAt?: string | null;
  endAt?: string | null;
  timezone?: string;
  autoEnable?: boolean;
  autoDisable?: boolean;
}

export interface MaintenancePartnerConfig {
  allowDuringMaintenance?: boolean;
  whitelistAgentIds?: string[];
}

export interface MaintenanceCustomerPageConfig {
  supportLink?: string;
  telegram?: string;
  facebook?: string;
  hotline?: string;
  estimatedFinish?: string | null;
}

export interface MaintenanceHistoryEntry {
  id: string;
  action: string;
  mode: MaintenanceMode;
  reason?: string;
  performedBy: string;
  performedEmail: string;
  at: string;
  durationMs?: number;
}

export interface StoredMaintenance {
  mode?: MaintenanceMode;
  reason?: string;
  modules?: Partial<Record<MaintenanceModuleKey, boolean>>;
  banner?: MaintenanceBannerConfig;
  schedule?: MaintenanceScheduleConfig;
  partner?: MaintenancePartnerConfig;
  customerPage?: MaintenanceCustomerPageConfig;
  history?: MaintenanceHistoryEntry[];
  lastChangedAt?: string;
  lastChangedBy?: string;
  lastChangedEmail?: string;
}

export const DEFAULT_MAINTENANCE_MODULES: Record<MaintenanceModuleKey, boolean> = {
  products: true,
  orders: true,
  payment: true,
  topup: true,
  data: true,
  game_cards: true,
  marketing: true,
  partner_api: true,
  customer_api: true,
  public_api: true,
};

export function createDefaultMaintenanceConfig(): StoredMaintenance {
  return {
    mode: 'OFF',
    reason: '',
    modules: { ...DEFAULT_MAINTENANCE_MODULES },
    banner: {
      title: 'Hệ thống đang bảo trì',
      description: 'Chúng tôi đang nâng cấp hệ thống. Vui lòng quay lại sau.',
      icon: 'wrench',
      color: '#dc2626',
      buttonText: '',
      buttonLink: '',
      startAt: null,
      endAt: null,
    },
    schedule: {
      startAt: null,
      endAt: null,
      timezone: 'Asia/Ho_Chi_Minh',
      autoEnable: false,
      autoDisable: false,
    },
    partner: {
      allowDuringMaintenance: false,
      whitelistAgentIds: [],
    },
    customerPage: {
      supportLink: '',
      telegram: '',
      facebook: '',
      hotline: '',
      estimatedFinish: null,
    },
    history: [],
  };
}

export interface StoredPaymentRuntime {
  defaultGateway?: 'MEGAPAY' | 'SEPAY' | 'PAYOS' | 'VNPAY' | 'MOMO' | 'ZALOPAY' | 'NOWPAYMENTS';
}

export type MvpPaymentGatewayCode = 'MEGAPAY' | 'SEPAY';

export interface StoredPaymentGatewayRuntime {
  enabled?: boolean;
  priority?: number;
  displayName?: string;
  percentageFee?: number;
  fixedFee?: number;
}

export interface StoredPaymentStrategy {
  defaultGateway?: MvpPaymentGatewayCode;
  /** @deprecated Read-only migration — use gateway priority */
  primaryGateway?: MvpPaymentGatewayCode;
  /** @deprecated Read-only migration — use gateway priority */
  failoverGateway?: MvpPaymentGatewayCode;
}

export const DEFAULT_PAYMENT_GATEWAY_RUNTIME: Record<MvpPaymentGatewayCode, StoredPaymentGatewayRuntime> = {
  MEGAPAY: {
    enabled: true,
    priority: 1,
    displayName: 'MegaPay',
    percentageFee: 0,
    fixedFee: 0,
  },
  SEPAY: {
    enabled: true,
    priority: 2,
    displayName: 'SePay (dự phòng bán lẻ)',
    percentageFee: 0,
    fixedFee: 300,
  },
};

export const DEFAULT_PAYMENT_STRATEGY: StoredPaymentStrategy = {
  defaultGateway: 'MEGAPAY',
};
