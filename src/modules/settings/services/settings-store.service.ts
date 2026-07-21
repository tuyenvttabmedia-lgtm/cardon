import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MegapayConfig } from '../../payment/providers/megapay/megapay.config';
import { SepayConfig } from '../../payment/providers/sepay/sepay.config';
import { EsaleConfig } from '../../provider/adapters/esale/esale.config';
import {
  SETTINGS_KEYS,
  DEFAULT_PAYMENT_METHODS,
  StoredPaymentGateway,
  StoredPaymentMethod,
  StoredProviderEsale,
  StoredOrder,
  StoredPaymentRuntime,
  StoredPaymentGatewayRuntime,
  StoredPaymentStrategy,
  DEFAULT_PAYMENT_GATEWAY_RUNTIME,
  DEFAULT_PAYMENT_STRATEGY,
  StoredSmtp,
  StoredSystem,
  StoredTelegram,
  DEFAULT_MAINTENANCE_MODULES,
  createDefaultMaintenanceConfig,
  StoredMaintenance,
  MaintenanceMode,
} from '../entities/settings.constants';
import {
  DEFAULT_PAYMENT_GATEWAY,
  MvpPaymentGatewayCode,
  MVP_PAYMENT_GATEWAYS,
} from '../entities/payment-gateway.strategy';
import {
  normalizeMethodCode,
  normalizeStoredPaymentMethod,
} from '../../payment/entities/payment-method.constants';
import { SettingsEncryptionService } from './settings-encryption.service';
import { SettingsRepository } from '../repositories/settings.repository';

export interface ResolvedSmtpConfig {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
  fromName?: string;
  secure: boolean;
}

function normalizePem(value?: string): string | undefined {
  if (!value) return undefined;
  return value.replace(/\\n/g, '\n').trim();
}

function isMeaningfulStored(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  return Object.keys(value as Record<string, unknown>).length > 0;
}

@Injectable()
export class SettingsStoreService implements OnModuleInit {
  private readonly cache = new Map<string, unknown>();
  private loadPromise: Promise<void> | null = null;

  constructor(
    private readonly repository: SettingsRepository,
    private readonly encryption: SettingsEncryptionService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    this.cache.clear();
    this.loadPromise = this.loadFromDatabase();
    await this.loadPromise;
  }

  private async loadFromDatabase(): Promise<void> {
    const rows = await this.repository.findAll();
    for (const row of rows) {
      this.cache.set(row.key, row.value);
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loadPromise) {
      await this.loadPromise;
    }
  }

  getStored<T>(key: string): T | null {
    const value = this.cache.get(key);
    return (value as T) ?? null;
  }

  hasDbSetting(key: string): boolean {
    return isMeaningfulStored(this.cache.get(key));
  }

  async getRawStored<T>(key: string): Promise<T | null> {
    await this.ensureLoaded();
    return this.getStored<T>(key);
  }

  decryptField(enc?: string): string | undefined {
    if (!enc) return undefined;
    try {
      return this.encryption.decrypt(enc);
    } catch {
      return undefined;
    }
  }

  resolveMegapayConfig(): MegapayConfig {
    const stored = this.getStored<StoredPaymentGateway>(
      SETTINGS_KEYS.PAYMENT_MEGAPAY,
    );
    const merchantId =
      stored?.merchantId ??
      this.configService.get<string>('megapay.merchantId');
    const secretKey =
      (stored?.secretKeyEnc
        ? this.decryptField(stored.secretKeyEnc)
        : undefined) ?? this.configService.get<string>('megapay.secretKey');
    const endpoint =
      stored?.endpoint ?? this.configService.get<string>('megapay.endpoint');
    const returnUrl =
      stored?.returnUrl ??
      this.configService.get<string>('megapay.returnUrl') ??
      this.configService.get<string>('appPublicUrl') ??
      'http://localhost/checkout/result';
    const webhookSecret =
      (stored?.webhookSecretEnc
        ? this.decryptField(stored.webhookSecretEnc)
        : undefined) ??
      this.configService.get<string>('megapay.webhookSecret') ??
      '';
    const bankCode =
      stored?.bankCode ??
      this.configService.get<string>('megapay.bankCode') ??
      'WOORIBANK';
    const notifyPublicKeyRaw =
      this.configService.get<string>('megapay.notifyPublicKey') ??
      webhookSecret;
    const notifyPublicKey =
      normalizePem(notifyPublicKeyRaw) ?? '';

    if (!merchantId || !secretKey || !endpoint || !notifyPublicKey) {
      throw new Error(
        'VNPT ePay DepositCode is not configured. Set MEGAPAY_MERCHANT_ID, MEGAPAY_SECRET_KEY (3DES), MEGAPAY_ENDPOINT, MEGAPAY_NOTIFY_PUBLIC_KEY.',
      );
    }

    const callbackUrl =
      stored?.callbackUrl ??
      this.configService.get<string>('megapay.callbackUrl') ??
      this.buildMegapayCallbackUrl();

    return {
      merchantId,
      secretKey,
      endpoint: endpoint.replace(/\/$/, ''),
      returnUrl,
      webhookSecret: webhookSecret || 'depositcode-rsa',
      callbackUrl,
      bankCode,
      notifyPublicKey,
    };
  }

  isMegapayConfigured(): boolean {
    try {
      this.resolveMegapayConfig();
      return true;
    } catch {
      return false;
    }
  }

  getMegapayAdminView(): Record<string, unknown> {
    const stored = this.getStored<StoredPaymentGateway>(
      SETTINGS_KEYS.PAYMENT_MEGAPAY,
    );
    let config: MegapayConfig | null = null;
    try {
      config = this.resolveMegapayConfig();
    } catch {
      config = null;
    }

    return {
      enabled: stored?.enabled ?? false,
      environment: stored?.environment ?? 'production',
      merchantId: config?.merchantId ?? stored?.merchantId ?? '',
      endpoint: config?.endpoint ?? stored?.endpoint ?? '',
      returnUrl: config?.returnUrl ?? stored?.returnUrl ?? '',
      callbackUrl: config?.callbackUrl ?? stored?.callbackUrl ?? '',
      webhookUrl: stored?.webhookUrl ?? config?.callbackUrl ?? '',
      secretKey: this.encryption.maskSecret(config?.secretKey),
      webhookSecret: this.encryption.maskSecret(config?.webhookSecret),
      configured: !!config,
      source: this.hasDbSetting(SETTINGS_KEYS.PAYMENT_MEGAPAY)
        ? 'database'
        : 'environment',
    };
  }

  resolveSepayConfig(): SepayConfig {
    const stored = this.getStored<StoredPaymentGateway>(
      SETTINGS_KEYS.PAYMENT_SEPAY,
    );
    const publicUrl =
      this.configService.get<string>('appPublicUrl') ??
      this.getStored<{ publicUrl?: string }>(SETTINGS_KEYS.SYSTEM)?.publicUrl ??
      'https://cardon.vn';

    const explicitMode = stored?.integrationMode;
    const merchantId =
      stored?.merchantId ?? this.configService.get<string>('sepay.merchantId');
    const merchantSecretKey =
      (stored?.secretKeyEnc
        ? this.decryptField(stored.secretKeyEnc)
        : undefined) ??
      this.configService.get<string>('sepay.merchantSecretKey') ??
      this.configService.get<string>('sepay.secretKey');
    const ipnSecretKey =
      (stored?.webhookSecretEnc
        ? this.decryptField(stored.webhookSecretEnc)
        : undefined) ??
      this.configService.get<string>('sepay.ipnSecretKey') ??
      this.configService.get<string>('sepay.webhookSecret') ??
      '';
    const integrationMode =
      explicitMode ??
      (merchantId && merchantSecretKey ? 'payment_gateway' : 'legacy_qr');

    if (integrationMode === 'payment_gateway') {
      if (!merchantId || !merchantSecretKey || !ipnSecretKey) {
        throw new Error(
          'SePay Payment Gateway is not configured. Set merchantId, secretKey and IPN secret in Admin Settings.',
        );
      }
      return {
        mode: 'payment_gateway',
        merchantId,
        merchantSecretKey,
        ipnSecretKey,
        // Bank-transfer webhook HMAC (separate from PG IPN secret).
        webhookSecret:
          this.configService.get<string>('sepay.hmacSecret') || undefined,
        apiKey: this.configService.get<string>('sepay.apiKey') || undefined,
        environment:
          stored?.environment === 'sandbox' ||
          this.configService.get<string>('sepay.environment') === 'sandbox'
            ? 'sandbox'
            : 'production',
        paymentMethod: stored?.paymentMethod ?? 'BANK_TRANSFER',
        publicUrl: publicUrl.replace(/\/$/, ''),
        bankAccount:
          stored?.bankAccount ??
          this.configService.get<string>('sepay.bankAccount'),
        bankCode:
          stored?.bankCode ?? this.configService.get<string>('sepay.bankCode'),
        accountName:
          stored?.accountName ??
          this.configService.get<string>('sepay.accountName'),
        qrTemplate:
          stored?.qrTemplate ??
          this.configService.get<string>('sepay.qrTemplate') ??
          'compact',
      };
    }

    const apiKey =
      (stored?.apiKeyEnc
        ? this.decryptField(stored.apiKeyEnc)
        : undefined) ?? this.configService.get<string>('sepay.apiKey');
    const webhookSecret =
      (stored?.webhookSecretEnc
        ? this.decryptField(stored.webhookSecretEnc)
        : undefined) ??
      this.configService.get<string>('sepay.webhookSecret') ??
      '';
    const bankAccount =
      stored?.bankAccount ??
      this.configService.get<string>('sepay.bankAccount');
    const bankCode =
      stored?.bankCode ?? this.configService.get<string>('sepay.bankCode');
    const accountName =
      stored?.accountName ??
      this.configService.get<string>('sepay.accountName');
    const qrTemplate =
      stored?.qrTemplate ??
      this.configService.get<string>('sepay.qrTemplate') ??
      'compact';

    // HMAC-only webhooks do not need API Key; bank QR still needs account fields.
    if ((!apiKey && !webhookSecret) || !bankAccount || !bankCode || !accountName) {
      throw new Error(
        'SePay is not configured. Set bank account + HMAC webhook secret (or API key) in Admin / SEPAY_* env.',
      );
    }

    return {
      mode: 'legacy_qr',
      apiKey: apiKey || undefined,
      webhookSecret: webhookSecret || undefined,
      bankAccount,
      bankCode,
      accountName,
      qrTemplate,
    };
  }

  isSepayConfigured(): boolean {
    try {
      this.resolveSepayConfig();
      return true;
    } catch {
      return false;
    }
  }

  /** Customer-facing payment options — no gateway branding, no secrets. */
  getPublicPaymentMethods(): Array<{
    methodCode: string;
    displayName: string;
    description: string;
    iconUrl: string | null;
    logoUrl: string | null;
    enabled: boolean;
    percentageFee: number;
    fixedFee: number;
    gatewayCode: string;
  }> {
    return this.resolvePublicPaymentMethods().map((method) => ({
      methodCode: method.methodCode,
      displayName: method.displayName,
      description: method.description ?? '',
      iconUrl: method.iconUrl ?? null,
      logoUrl: method.logoUrl ?? null,
      enabled: true,
      percentageFee: method.percentageFee,
      fixedFee: method.fixedFee,
      gatewayCode: method.gatewayCode,
    }));
  }

  getPaymentMethodsAdminView(): StoredPaymentMethod[] {
    return this.mergePaymentMethodsConfig();
  }

  resolvePaymentMethod(methodCode: string): StoredPaymentMethod | null {
    const normalized = normalizeMethodCode(methodCode);
    const match = this.resolvePublicPaymentMethods().find(
      (method) => method.methodCode === normalized,
    );
    return match ?? null;
  }

  private resolvePublicPaymentMethods(): StoredPaymentMethod[] {
    return this.mergePaymentMethodsConfig().filter((method) => {
      if (!method.enabled) return false;
      if (method.gatewayCode === 'SEPAY') {
        return this.isGatewayPubliclyEnabled(
          SETTINGS_KEYS.PAYMENT_SEPAY,
          () => this.isSepayConfigured(),
        );
      }
      if (method.gatewayCode === 'MEGAPAY') {
        return this.isGatewayPubliclyEnabled(
          SETTINGS_KEYS.PAYMENT_MEGAPAY,
          () => this.isMegapayConfigured(),
        );
      }
      return false;
    });
  }

  private mergePaymentMethodsConfig(): StoredPaymentMethod[] {
    const stored = this.getStored<{ methods?: Array<Partial<StoredPaymentMethod> & { code?: string; name?: string; gateway?: string }> }>(
      SETTINGS_KEYS.PAYMENT_METHODS,
    );
    const configured = Array.isArray(stored?.methods) ? stored.methods : [];
    const byMethodCode = new Map<string, StoredPaymentMethod>();
    const obsoleteRawCodes = new Set([
      'ATM',
      'VISA',
      'WALLET',
      'MEGAPAY_ATM',
      'MEGAPAY_VISA',
      'MEGAPAY_WALLET',
      'BANK_GATEWAY',
    ]);

    for (const defaults of DEFAULT_PAYMENT_METHODS) {
      byMethodCode.set(defaults.methodCode, { ...defaults });
    }

    for (const item of configured) {
      const rawCode = String(item.methodCode ?? item.code ?? '')
        .trim()
        .toUpperCase();
      if (obsoleteRawCodes.has(rawCode)) {
        continue;
      }
      const normalized = normalizeStoredPaymentMethod(item);
      if (!normalized) continue;
      byMethodCode.set(normalized.methodCode, normalized);
    }

    return DEFAULT_PAYMENT_METHODS.map(
      (defaults) => byMethodCode.get(defaults.methodCode) ?? { ...defaults },
    );
  }

  private isGatewayPubliclyEnabled(
    key: string,
    isConfigured: () => boolean,
  ): boolean {
    if (!isConfigured()) return false;
    if (!this.hasDbSetting(key)) return true;
    const stored = this.getStored<StoredPaymentGateway>(key);
    return Boolean(stored?.enabled);
  }

  getSepayAdminView(): Record<string, unknown> {
    const stored = this.getStored<StoredPaymentGateway>(
      SETTINGS_KEYS.PAYMENT_SEPAY,
    );
    let config: SepayConfig | null = null;
    try {
      config = this.resolveSepayConfig();
    } catch {
      config = null;
    }

    return {
      enabled: stored?.enabled ?? false,
      environment: stored?.environment ?? 'production',
      integrationMode:
        stored?.integrationMode ??
        (stored?.merchantId ? 'payment_gateway' : 'legacy_qr'),
      merchantId: stored?.merchantId ?? '',
      paymentMethod: stored?.paymentMethod ?? 'BANK_TRANSFER',
      bankAccount: config?.bankAccount ?? stored?.bankAccount ?? '',
      bankCode: config?.bankCode ?? stored?.bankCode ?? '',
      accountName: config?.accountName ?? stored?.accountName ?? '',
      qrTemplate: config?.qrTemplate ?? stored?.qrTemplate ?? 'compact',
      webhookUrl: stored?.webhookUrl ?? '',
      apiKey: this.encryption.maskSecret(config?.apiKey),
      secretKey: this.encryption.maskSecret(config?.merchantSecretKey),
      webhookSecret: this.encryption.maskSecret(
        config?.mode === 'payment_gateway'
          ? config?.ipnSecretKey
          : config?.webhookSecret,
      ),
      configured: !!config,
      source: this.hasDbSetting(SETTINGS_KEYS.PAYMENT_SEPAY)
        ? 'database'
        : 'environment',
    };
  }

  resolveEsaleConfig(): EsaleConfig {
    const stored = this.getStored<StoredProviderEsale>(
      SETTINGS_KEYS.PROVIDER_ESALE,
    );
    const cardApiUrl =
      stored?.cardApiUrl ??
      this.configService.get<string>('esale.cardApiUrl') ??
      this.configService.get<string>('esale.apiUrl');
    const topupApiUrl =
      stored?.topupApiUrl ??
      this.configService.get<string>('esale.topupApiUrl');
    const agencyCode =
      stored?.agencyCode ??
      this.configService.get<string>('esale.agencyCode') ??
      this.configService.get<string>('esale.partnerId');
    const clientCode =
      stored?.clientCode ?? this.configService.get<string>('esale.clientCode');
    const secretKey =
      (stored?.secretKeyEnc
        ? this.decryptField(stored.secretKeyEnc)
        : undefined) ??
      this.configService.get<string>('esale.secretKey') ??
      this.configService.get<string>('esale.partnerKey');
    const privateKeyPem = normalizePem(
      (stored?.privateKeyEnc
        ? this.decryptField(stored.privateKeyEnc)
        : undefined) ?? this.configService.get<string>('esale.privateKey'),
    );
    const esalePublicKeyPem = normalizePem(
      (stored?.publicKeyEnc
        ? this.decryptField(stored.publicKeyEnc)
        : undefined) ?? this.configService.get<string>('esale.publicKey'),
    );

    if (
      !cardApiUrl ||
      !topupApiUrl ||
      !agencyCode ||
      !clientCode ||
      !secretKey ||
      !privateKeyPem
    ) {
      throw new Error(
        'eSale is not configured. Set ESALE_* env vars or configure in Admin Settings.',
      );
    }

    return {
      cardApiUrl: cardApiUrl.replace(/\/$/, '') + '/',
      topupApiUrl: topupApiUrl.replace(/\/$/, '') + '/',
      agencyCode,
      clientCode,
      secretKey,
      privateKeyPem,
      esalePublicKeyPem,
      timeoutMs:
        stored?.timeoutMs ??
        this.configService.get<number>('esale.timeoutMs') ??
        30_000,
      defaultCardType:
        this.configService.get<string>('esale.defaultCardType') ?? 'Card',
      verifyResponseSignature:
        this.configService.get<boolean>('esale.verifyResponseSignature') ??
        !!esalePublicKeyPem,
    };
  }

  isEsaleConfigured(): boolean {
    try {
      this.resolveEsaleConfig();
      return true;
    } catch {
      return false;
    }
  }

  getEsaleAdminView(): Record<string, unknown> {
    const stored = this.getStored<StoredProviderEsale>(
      SETTINGS_KEYS.PROVIDER_ESALE,
    );
    let config: EsaleConfig | null = null;
    try {
      config = this.resolveEsaleConfig();
    } catch {
      config = null;
    }

    return {
      enabled: stored?.enabled ?? false,
      environment: stored?.environment ?? 'production',
      cardApiUrl: config?.cardApiUrl ?? stored?.cardApiUrl ?? '',
      topupApiUrl: config?.topupApiUrl ?? stored?.topupApiUrl ?? '',
      agencyCode: config?.agencyCode ?? stored?.agencyCode ?? '',
      clientCode: config?.clientCode ?? stored?.clientCode ?? '',
      timeoutMs: config?.timeoutMs ?? stored?.timeoutMs ?? 30_000,
      secretKey: this.encryption.maskSecret(config?.secretKey),
      privateKey: config?.privateKeyPem ? '***********' : undefined,
      publicKey: config?.esalePublicKeyPem ? '***********' : undefined,
      configured: !!config,
      source: this.hasDbSetting(SETTINGS_KEYS.PROVIDER_ESALE)
        ? 'database'
        : 'environment',
    };
  }

  resolveSmtpConfig(): ResolvedSmtpConfig | null {
    const stored = this.getStored<StoredSmtp>(SETTINGS_KEYS.SMTP);
    const host = stored?.host ?? this.configService.get<string>('smtp.host');
    if (!host) return null;

    const port =
      stored?.port ?? this.configService.get<number>('smtp.port') ?? 587;
    const user = stored?.username ?? this.configService.get<string>('smtp.user');
    const pass =
      (stored?.passwordEnc
        ? this.decryptField(stored.passwordEnc)
        : undefined) ?? this.configService.get<string>('smtp.pass');
    const from =
      stored?.from ??
      this.configService.get<string>('smtp.from') ??
      this.configService.get<string>('smtp.fromEmail') ??
      'noreply@cardon.vn';
    const fromName =
      stored?.fromName ?? this.configService.get<string>('smtp.fromName');
    const secure =
      stored?.secure ??
      this.configService.get<boolean>('smtp.secure') ??
      false;

    return { host, port, user, pass, from, fromName, secure };
  }

  getSmtpAdminView(): Record<string, unknown> {
    const stored = this.getStored<StoredSmtp>(SETTINGS_KEYS.SMTP);
    let resolved: ResolvedSmtpConfig | null = null;
    try {
      resolved = this.resolveSmtpConfig();
    } catch {
      resolved = null;
    }

    return {
      enabled: stored?.enabled ?? !!resolved,
      host: resolved?.host ?? stored?.host ?? '',
      port: resolved?.port ?? stored?.port ?? 587,
      username: resolved?.user ?? stored?.username ?? '',
      password: this.encryption.maskSecret(resolved?.pass),
      from: resolved?.from ?? stored?.from ?? '',
      fromName: resolved?.fromName ?? stored?.fromName ?? '',
      secure: resolved?.secure ?? stored?.secure ?? false,
      configured: !!resolved,
      source: this.hasDbSetting(SETTINGS_KEYS.SMTP) ? 'database' : 'environment',
    };
  }

  resolveSystemConfig(): StoredSystem {
    const stored = this.getStored<StoredSystem>(SETTINGS_KEYS.SYSTEM);
    const envMode = this.configService.get<string>('agent.registrationMode');
    const allowedModes = ['INVITE_ONLY', 'PUBLIC_APPROVAL', 'DISABLED'] as const;
    const agentRegistrationMode =
      envMode && (allowedModes as readonly string[]).includes(envMode)
        ? (envMode as (typeof allowedModes)[number])
        : (stored?.agentRegistrationMode ?? 'PUBLIC_APPROVAL');

    return {
      siteName: stored?.siteName ?? 'CardOn.vn',
      publicUrl:
        stored?.publicUrl ?? this.configService.get<string>('appPublicUrl') ?? '',
      providerLowBalanceThreshold:
        stored?.providerLowBalanceThreshold ??
        this.configService.get<number>('provider.lowBalanceThreshold') ??
        500_000,
      agentLowBalanceThreshold:
        stored?.agentLowBalanceThreshold ??
        this.configService.get<number>('agent.lowBalanceThreshold') ??
        100_000,
      agentRegistrationMode,
      customerTopupEnabled: stored?.customerTopupEnabled ?? false,
      customerDataEnabled: stored?.customerDataEnabled ?? false,
    };
  }

  getSystemAdminView(): Record<string, unknown> {
    const resolved = this.resolveSystemConfig();
    return {
      ...resolved,
      source: this.hasDbSetting(SETTINGS_KEYS.SYSTEM) ? 'database' : 'environment',
    };
  }

  resolveOrderConfig(): StoredOrder {
    const stored = this.getStored<StoredOrder>(SETTINGS_KEYS.ORDER);
    return {
      guestMaxOrderAmount: stored?.guestMaxOrderAmount ?? 0,
      customerMaxOrderAmount: stored?.customerMaxOrderAmount ?? 0,
    };
  }

  getOrderAdminView(): Record<string, unknown> {
    return {
      ...this.resolveOrderConfig(),
      source: this.hasDbSetting(SETTINGS_KEYS.ORDER) ? 'database' : 'environment',
    };
  }

  resolveTelegramConfig(): StoredTelegram | null {
    const stored = this.getStored<StoredTelegram>(SETTINGS_KEYS.TELEGRAM);
    if (!stored?.enabled) return null;
    const token = stored.botTokenEnc
      ? this.decryptField(stored.botTokenEnc)
      : this.configService.get<string>('telegram.botToken');
    const chatId = stored.chatId ?? this.configService.get<string>('telegram.chatId');
    if (!token || !chatId) return null;
    return { enabled: true, botTokenEnc: token, chatId };
  }

  getTelegramAdminView(): Record<string, unknown> {
    const stored = this.getStored<StoredTelegram>(SETTINGS_KEYS.TELEGRAM) ?? {};
    const token = stored.botTokenEnc
      ? this.decryptField(stored.botTokenEnc)
      : undefined;
    return {
      enabled: stored.enabled ?? false,
      chatId: stored.chatId ?? '',
      botToken: this.encryption.maskSecret(token),
      source: this.hasDbSetting(SETTINGS_KEYS.TELEGRAM) ? 'database' : 'environment',
    };
  }

  resolvePaymentRuntime(): StoredPaymentRuntime {
    return { defaultGateway: this.resolveDefaultPaymentGateway() };
  }

  resolveDefaultPaymentGateway(): MvpPaymentGatewayCode {
    const ordered = this.resolveOrderedPaymentGateways().filter((g) => g.enabled);
    return ordered[0]?.code ?? DEFAULT_PAYMENT_GATEWAY;
  }

  resolveOrderedPaymentGateways(): Array<{
    code: MvpPaymentGatewayCode;
    label: string;
    priority: number;
    enabled: boolean;
    displayName: string;
  }> {
    return MVP_PAYMENT_GATEWAYS.map((gateway) => {
      const runtime = this.resolvePaymentGatewayRuntime(gateway.code);
      return {
        code: gateway.code,
        label: gateway.label,
        priority: runtime.priority ?? DEFAULT_PAYMENT_GATEWAY_RUNTIME[gateway.code].priority ?? 99,
        enabled: Boolean(runtime.enabled),
        displayName: runtime.displayName ?? gateway.label,
      };
    }).sort((a, b) => a.priority - b.priority);
  }

  /** Enabled gateways sorted by priority ASC — lowest priority number is tried first. */
  resolvePaymentGatewaySelectionOrder(): MvpPaymentGatewayCode[] {
    return this.resolveOrderedPaymentGateways()
      .filter((gateway) => gateway.enabled)
      .map((gateway) => gateway.code);
  }

  resolvePaymentStrategy(): StoredPaymentStrategy {
    return {
      defaultGateway: this.resolveDefaultPaymentGateway(),
    };
  }

  private resolveLegacyGatewayPriority(code: MvpPaymentGatewayCode): number | null {
    const strategy = this.getStored<StoredPaymentStrategy>(SETTINGS_KEYS.PAYMENT_STRATEGY);
    if (strategy?.primaryGateway) {
      if (code === strategy.primaryGateway) return 1;
      if (code === strategy.failoverGateway) return 2;
      return code === strategy.primaryGateway ? 1 : 2;
    }

    const legacy = this.getStored<StoredPaymentRuntime>(SETTINGS_KEYS.PAYMENT_RUNTIME);
    const legacyGateway = legacy?.defaultGateway;
    if (legacyGateway === 'MEGAPAY' || legacyGateway === 'SEPAY') {
      return code === legacyGateway ? 1 : 2;
    }

    return null;
  }

  resolvePaymentGatewayRuntime(code: MvpPaymentGatewayCode): StoredPaymentGatewayRuntime {
    const key =
      code === 'MEGAPAY'
        ? SETTINGS_KEYS.PAYMENT_GATEWAY_MEGAPAY
        : SETTINGS_KEYS.PAYMENT_GATEWAY_SEPAY;
    const stored = this.getStored<StoredPaymentGatewayRuntime>(key);
    const defaults = DEFAULT_PAYMENT_GATEWAY_RUNTIME[code];
    const credentials =
      code === 'MEGAPAY'
        ? this.getStored<StoredPaymentGateway>(SETTINGS_KEYS.PAYMENT_MEGAPAY)
        : this.getStored<StoredPaymentGateway>(SETTINGS_KEYS.PAYMENT_SEPAY);
    const legacyPriority = this.resolveLegacyGatewayPriority(code);
    const priority =
      stored?.priority != null && stored.priority > 0
        ? stored.priority
        : legacyPriority ?? defaults.priority ?? 99;

    return {
      ...defaults,
      ...stored,
      priority,
      enabled: resolveGatewayEnabled(stored?.enabled, credentials?.enabled, defaults.enabled),
    };
  }

  getPaymentStrategyAdminView(): Record<string, unknown> {
    const ordered = this.resolveOrderedPaymentGateways();
    const gateways = ordered.map((gateway) => ({
      code: gateway.code,
      label: gateway.label,
      priority: gateway.priority,
      enabled: gateway.enabled,
      displayName: gateway.displayName,
      runtime: {
        ...this.resolvePaymentGatewayRuntime(gateway.code),
        source: this.hasDbSetting(
          gateway.code === 'MEGAPAY'
            ? SETTINGS_KEYS.PAYMENT_GATEWAY_MEGAPAY
            : SETTINGS_KEYS.PAYMENT_GATEWAY_SEPAY,
        )
          ? 'database'
          : 'environment',
      },
    }));

    return {
      defaultGateway: this.resolveDefaultPaymentGateway(),
      gateways,
      selectionOrder: this.resolvePaymentGatewaySelectionOrder(),
      source: this.hasDbSetting(SETTINGS_KEYS.PAYMENT_STRATEGY)
        ? 'database'
        : this.hasDbSetting(SETTINGS_KEYS.PAYMENT_RUNTIME)
          ? 'database'
          : 'environment',
    };
  }

  getPaymentGatewayRuntimeAdminView(code: MvpPaymentGatewayCode): Record<string, unknown> {
    const key =
      code === 'MEGAPAY'
        ? SETTINGS_KEYS.PAYMENT_GATEWAY_MEGAPAY
        : SETTINGS_KEYS.PAYMENT_GATEWAY_SEPAY;
    return {
      code,
      ...this.resolvePaymentGatewayRuntime(code),
      source: this.hasDbSetting(key) ? 'database' : 'environment',
    };
  }

  getPaymentRuntimeAdminView(): Record<string, unknown> {
    return {
      defaultGateway: this.resolveDefaultPaymentGateway(),
      source: this.hasDbSetting(SETTINGS_KEYS.PAYMENT_STRATEGY)
        ? 'database'
        : this.hasDbSetting(SETTINGS_KEYS.PAYMENT_RUNTIME)
          ? 'database'
          : 'environment',
    };
  }

  private buildMegapayCallbackUrl(): string {
    const publicUrl = this.configService.get<string>('appPublicUrl');
    const apiPrefix = this.configService.get<string>('app.apiPrefix') ?? 'api/v1';
    if (!publicUrl) {
      throw new Error(
        'MEGAPAY_CALLBACK_URL or APP_PUBLIC_URL must be set for MegaPay callback_url',
      );
    }
    return `${publicUrl.replace(/\/$/, '')}/${apiPrefix}/payments/webhook/megapay`;
  }

  resolveMaintenanceConfig(): StoredMaintenance & { mode: MaintenanceMode } {
    const stored = this.getStored<StoredMaintenance>(SETTINGS_KEYS.MAINTENANCE);
    const defaults = createDefaultMaintenanceConfig();
    const mode = (stored?.mode ?? defaults.mode ?? 'OFF') as MaintenanceMode;
    return {
      ...defaults,
      ...stored,
      mode,
      modules: { ...DEFAULT_MAINTENANCE_MODULES, ...defaults.modules, ...stored?.modules },
      banner: { ...defaults.banner, ...stored?.banner },
      schedule: { ...defaults.schedule, ...stored?.schedule },
      partner: { ...defaults.partner, ...stored?.partner },
      customerPage: { ...defaults.customerPage, ...stored?.customerPage },
      history: stored?.history ?? [],
    };
  }

  mergeMaintenanceConfig(partial: Partial<StoredMaintenance>): StoredMaintenance & { mode: MaintenanceMode } {
    const current = this.resolveMaintenanceConfig();
    const next = {
      ...current,
      ...partial,
      modules: { ...current.modules, ...partial.modules },
      banner: { ...current.banner, ...partial.banner },
      schedule: { ...current.schedule, ...partial.schedule },
      partner: { ...current.partner, ...partial.partner },
      customerPage: { ...current.customerPage, ...partial.customerPage },
    };
    this.cache.set(SETTINGS_KEYS.MAINTENANCE, next);
    return next;
  }

  getMaintenanceAdminView(): Record<string, unknown> {
    const resolved = this.resolveMaintenanceConfig();
    return {
      ...resolved,
      source: this.hasDbSetting(SETTINGS_KEYS.MAINTENANCE) ? 'database' : 'environment',
    };
  }
}

/** Runtime enabled AND credential toggle (Admin off MegaPay/SePay credentials forces gateway off). */
function resolveGatewayEnabled(
  storedEnabled: boolean | undefined,
  credentialsEnabled: boolean | undefined,
  defaultEnabled: boolean | undefined,
): boolean {
  if (credentialsEnabled === false) return false;
  if (storedEnabled !== undefined) return Boolean(storedEnabled);
  if (credentialsEnabled !== undefined) return Boolean(credentialsEnabled);
  return Boolean(defaultEnabled);
}
