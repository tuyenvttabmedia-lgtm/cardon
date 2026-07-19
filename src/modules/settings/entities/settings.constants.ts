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
  SMTP: 'settings.smtp',
  SYSTEM: 'settings.system',
  ORDER: 'settings.order',
  TELEGRAM: 'settings.telegram',
  MAINTENANCE: 'settings.maintenance',
} as const;

export const SETTINGS_AUDIT_ACTION = 'SETTING_UPDATED';

export const MASKED_SECRET_PATTERN = /^\*{8}/;

export type SettingsEnvironment = 'sandbox' | 'production';

export interface StoredPaymentGateway {
  enabled?: boolean;
  environment?: SettingsEnvironment;
  /** legacy_qr | payment_gateway — defaults to payment_gateway when merchantId is set */
  integrationMode?: 'legacy_qr' | 'payment_gateway';
  merchantId?: string;
  endpoint?: string;
  returnUrl?: string;
  callbackUrl?: string;
  webhookUrl?: string;
  secretKeyEnc?: string;
  webhookSecretEnc?: string;
  apiKeyEnc?: string;
  bankAccount?: string;
  bankCode?: string;
  accountName?: string;
  qrTemplate?: string;
  /** BANK_TRANSFER | NAPAS_BANK_TRANSFER for PG checkout */
  paymentMethod?: 'BANK_TRANSFER' | 'NAPAS_BANK_TRANSFER';
}

export type PaymentMethodGateway = 'SEPAY' | 'MEGAPAY';

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
  enabled: boolean;
  percentageFee: number;
  fixedFee: number;
}

export const DEFAULT_PAYMENT_METHODS: StoredPaymentMethod[] = [
  {
    gatewayCode: 'SEPAY',
    methodCode: 'VIETQR',
    displayName: 'VietQR',
    description: 'Chuyển khoản QR',
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
    methodCode: 'ATM',
    displayName: 'ATM nội địa',
    description: 'Thẻ ATM nội địa',
    iconUrl: null,
    logoUrl: null,
    settlementType: 'GATEWAY_SETTLEMENT',
    enabled: false,
    percentageFee: 0,
    fixedFee: 0,
  },
  {
    gatewayCode: 'MEGAPAY',
    methodCode: 'VISA',
    displayName: 'Visa / Mastercard',
    description: 'Thẻ quốc tế',
    iconUrl: null,
    logoUrl: null,
    settlementType: 'GATEWAY_SETTLEMENT',
    enabled: false,
    percentageFee: 2.2,
    fixedFee: 2200,
  },
  {
    gatewayCode: 'MEGAPAY',
    methodCode: 'WALLET',
    displayName: 'Ví điện tử',
    description: 'Thanh toán ví',
    iconUrl: null,
    logoUrl: null,
    settlementType: 'GATEWAY_SETTLEMENT',
    enabled: false,
    percentageFee: 0,
    fixedFee: 0,
  },
];

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
}

export interface StoredOrder {
  guestMaxOrderAmount?: number;
  customerMaxOrderAmount?: number;
}

export interface StoredTelegram {
  enabled?: boolean;
  botTokenEnc?: string;
  chatId?: string;
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
  SEPAY: {
    enabled: true,
    priority: 1,
    displayName: 'SePay',
    percentageFee: 0,
    fixedFee: 300,
  },
  MEGAPAY: {
    enabled: true,
    priority: 2,
    displayName: 'MegaPay',
    percentageFee: 0,
    fixedFee: 0,
  },
};

export const DEFAULT_PAYMENT_STRATEGY: StoredPaymentStrategy = {
  defaultGateway: 'SEPAY',
};
