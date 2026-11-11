import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditTargetType, EsimCatalogLifecycle, Prisma } from '@prisma/client';
import { EsaleHttpClient } from '../../provider/adapters/esale/esale.client';
import { ProviderRepository } from '../../provider/repositories/provider.repository';
import { ProviderHealthService } from '../../provider/services/provider-health.service';
import { ProviderRegistryService } from '../../provider/services/provider-registry.service';
import { SmtpEmailProvider } from '../../notification/providers/smtp-email.provider';
import {
  SETTINGS_AUDIT_ACTION,
  SETTINGS_KEYS,
  StoredPaymentGateway,
  StoredProviderAiralo,
  StoredPaymentPaypal,
  StoredProviderEsale,
  StoredOrder,
  StoredPaymentGatewayRuntime,
  StoredSmtp,
  StoredSystem,
  StoredTelegram,
  StoredTurnstile,
} from '../../settings/entities/settings.constants';
import { SettingsEncryptionService } from '../../settings/services/settings-encryption.service';
import { SettingsRepository } from '../../settings/repositories/settings.repository';
import { PaypalClient } from '../../payment/providers/paypal/paypal.client';
import { evaluatePaypalLiveGuard, isPaypalPlaceholder } from '../../payment/providers/paypal/paypal.rules';
import { isRetiredAiraloSandboxHost, SettingsStoreService } from '../../settings/services/settings-store.service';
import { validateGatewayPriorities } from '../../settings/entities/payment-gateway-priority';
import {
  TestSmtpDto,
  UpdatePaymentGatewayDto,
  UpdatePaymentMethodsDto,
  UpdatePaymentRuntimeDto,
  UpdatePaymentStrategyDto,
  UpdatePaymentGatewayRuntimeDto,
  UpdateProviderEsaleDto,
  UpdateProviderAiraloDto,
  UpdateAiraloPackageLifecycleDto,
  UpdatePaymentPaypalDto,
  UpdateProviderEsimGoDto,
  UpdateSmtpSettingsDto,
  UpdateSystemSettingsDto,
  UpdateOrderSettingsDto,
  UpdateTelegramSettingsDto,
  UpdateTurnstileSettingsDto,
} from '../dto/settings.dto';
import { EsimAiraloAdapter } from '../../esim/esim-airalo.adapter';
import { EsimAiraloCatalogueService } from '../../esim/esim-airalo-catalogue.service';
import { AdminAuditService } from './admin-audit.service';

@Injectable()
export class SettingsAdminService {
  constructor(
    private readonly settingsStore: SettingsStoreService,
    private readonly settingsRepository: SettingsRepository,
    private readonly encryption: SettingsEncryptionService,
    private readonly adminAudit: AdminAuditService,
    private readonly esaleClient: EsaleHttpClient,
    private readonly providerRepository: ProviderRepository,
    private readonly providerHealthService: ProviderHealthService,
    private readonly providerRegistry: ProviderRegistryService,
    private readonly smtpProvider: SmtpEmailProvider,
    private readonly airalo: EsimAiraloAdapter,
    private readonly airaloCatalogue: EsimAiraloCatalogueService,
    private readonly config: ConfigService,
  ) {}

  private paypalClient = new PaypalClient();

  getPaymentMegapay() {
    return this.settingsStore.getMegapayAdminView();
  }

  getPaymentSepay() {
    return this.settingsStore.getSepayAdminView();
  }

  getPaymentMethods() {
    return { methods: this.settingsStore.getPaymentMethodsAdminView() };
  }

  async updatePaymentMethods(adminId: string, dto: UpdatePaymentMethodsDto) {
    await this.persist(
      adminId,
      SETTINGS_KEYS.PAYMENT_METHODS,
      {
        methods: dto.methods.map((m) => ({
          gatewayCode: m.gatewayCode,
          methodCode: m.methodCode,
          displayName: m.displayName,
          description: m.description ?? '',
          iconUrl: m.iconUrl ?? null,
          logoUrl: m.logoUrl ?? null,
          settlementType: m.settlementType,
          enabled: m.enabled,
          esimEnabled: m.esimEnabled === true,
          percentageFee: m.percentageFee,
          fixedFee: m.fixedFee,
        })),
      } as unknown as Prisma.InputJsonValue,
      ['methods'],
    );
    return this.getPaymentMethods();
  }

  getProviderEsale() {
    return this.settingsStore.getEsaleAdminView();
  }

  getProviderEsimGo() {
    return {
      ...this.settingsStore.getEsimGoAdminView(),
      retired: true,
      message: 'eSIM Go đã gỡ khỏi runtime. Dùng cấu hình Airalo.',
    };
  }

  async updateProviderEsimGo(_adminId: string, _dto: UpdateProviderEsimGoDto) {
    throw new BadRequestException('eSIM Go đã ngừng dùng. Cấu hình Airalo thay thế.');
  }

  async testEsimGoCatalogue() {
    throw new BadRequestException('eSIM Go đã ngừng dùng. Dùng kiểm tra catalogue Airalo.');
  }

  getProviderAiralo() {
    return this.settingsStore.getAiraloAdminView();
  }

  async updateProviderAiralo(adminId: string, dto: UpdateProviderAiraloDto) {
    if (dto.baseUrl && isRetiredAiraloSandboxHost(dto.baseUrl)) {
      throw new BadRequestException(
        'sandbox-partners-api.airalo.com no longer resolves. Use https://partners-api.airalo.com — Airalo sandbox is an account mode, not a separate host.',
      );
    }
    const current =
      (await this.settingsStore.getRawStored<StoredProviderAiralo>(
        SETTINGS_KEYS.PROVIDER_AIRALO,
      )) ?? {};
    const next: StoredProviderAiralo = {
      clientIdEnc: this.mergeSecretField(dto.clientId, current.clientIdEnc),
      clientSecretEnc: this.mergeSecretField(dto.clientSecret, current.clientSecretEnc),
      baseUrl: dto.baseUrl?.trim() || current.baseUrl,
      usdVndRate: dto.usdVndRate ?? current.usdVndRate,
      accountMode: dto.accountMode ?? current.accountMode ?? 'sandbox',
    };
    await this.persist(adminId, SETTINGS_KEYS.PROVIDER_AIRALO, next as Prisma.InputJsonValue, [
      'clientId',
      'clientSecret',
      'baseUrl',
      'usdVndRate',
      'accountMode',
    ]);
    await this.providerRepository.ensureAiraloProvider();
    return this.getProviderAiralo();
  }

  async testAiraloCatalogue() {
    const view = this.settingsStore.getAiraloAdminView();
    if (view.configured !== true) {
      throw new BadRequestException('Chưa có Airalo client_id / client_secret');
    }
    try {
      const bundles = await this.airalo.listBundles();
      return {
        ok: true,
        count: bundles.length,
        names: bundles.slice(0, 20).map((bundle) => bundle.name),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Airalo catalogue request failed';
      throw new BadRequestException(message);
    }
  }

  listAiraloCatalogue() {
    return this.airaloCatalogue.listAdminCatalogue();
  }

  importAiraloCatalogue() {
    return this.airaloCatalogue.importFromAiralo();
  }

  /**
   * Register CardOn low-data webhook URL with Airalo (POST /v2/notifications/opt-in).
   * Prefer DNS-only host (AIRALO_WEBHOOK_PUBLIC_BASE_URL) + optional ?token= secret.
   */
  async optInAiraloLowDataWebhook() {
    const view = this.settingsStore.getAiraloAdminView();
    if (view.configured !== true) {
      throw new BadRequestException('Chưa có Airalo client_id / client_secret');
    }
    let publicUrl = (
      this.config.get<string>('airalo.webhookPublicBaseUrl') ||
      this.settingsStore.resolveSystemConfig().publicUrl ||
      'https://webhooks.cardon.vn'
    ).replace(/\/$/, '');
    // Airalo requires https; normalize misconfigured http publicUrl on prod hosts.
    if (publicUrl.startsWith('http://')) {
      publicUrl = `https://${publicUrl.slice('http://'.length)}`;
    }
    const secret = (this.config.get<string>('airalo.webhookSecret') ?? '').trim();
    const tokenQuery = secret ? `?token=${encodeURIComponent(secret)}` : '';
    const webhookUrl = `${publicUrl}/api/v1/webhooks/airalo/low-data${tokenQuery}`;
    const result = await this.airalo.optInLowDataWebhook(webhookUrl);
    return { ...result, webhookUrl };
  }

  setAiraloPackageLifecycle(id: string, dto: UpdateAiraloPackageLifecycleDto) {
    return this.airaloCatalogue.setLifecycle(id, dto.lifecycle as EsimCatalogLifecycle);
  }

  getPaymentPaypal() {
    return this.settingsStore.getPaypalAdminView();
  }

  async updatePaymentPaypal(adminId: string, dto: UpdatePaymentPaypalDto) {
    for (const value of [dto.clientId, dto.clientSecret, dto.webhookId]) {
      if (isPaypalPlaceholder(value)) {
        throw new BadRequestException('PayPal placeholder values cannot be saved');
      }
    }
    const current =
      (await this.settingsStore.getRawStored<StoredPaymentPaypal>(
        SETTINGS_KEYS.PAYMENT_PAYPAL,
      )) ?? {};
    const beforeFlags = this.paypalFlagSnapshot();
    const nextMode = dto.mode ?? current.mode ?? 'sandbox';
    const liveGuard = evaluatePaypalLiveGuard({
      mode: nextMode === 'live' ? 'live' : 'sandbox',
      clientId: this.paypalPlain(dto.clientId, current.clientIdEnc),
      clientSecret: this.paypalPlain(dto.clientSecret, current.clientSecretEnc),
      webhookId: this.paypalPlain(dto.webhookId, current.webhookIdEnc),
    });
    if (!liveGuard.ok) {
      throw new BadRequestException(
        'PayPal LIVE requires client id, client secret, and webhook id. Mode was not changed.',
      );
    }
    const next: StoredPaymentPaypal = {
      esimEnabled: current.esimEnabled === true,
      mode: nextMode === 'live' ? 'live' : 'sandbox',
      clientIdEnc: this.mergeSecretField(dto.clientId, current.clientIdEnc),
      clientSecretEnc: this.mergeSecretField(dto.clientSecret, current.clientSecretEnc),
      webhookIdEnc: this.mergeSecretField(dto.webhookId, current.webhookIdEnc),
    };
    const changed = ['mode', 'clientId', 'clientSecret', 'webhookId'];
    await this.persist(
      adminId,
      SETTINGS_KEYS.PAYMENT_PAYPAL,
      next as Prisma.InputJsonValue,
      changed,
      this.paypalAuditMeta(current.mode ?? 'sandbox', next.mode ?? 'sandbox', beforeFlags),
    );
    return this.getPaymentPaypal();
  }

  async testPaypalConnection(adminId: string) {
    const before = this.settingsStore.getPaypalAdminView();
    const config = this.settingsStore.resolvePaypalConfig();
    if (before.connectionStatus === 'NOT_CONFIGURED' || before.connectionStatus === 'INCOMPLETE') {
      return {
        connectionStatus: before.connectionStatus,
        probed: false,
        connected: false,
      };
    }
    if (config.mode === 'live') {
      return {
        connectionStatus: 'CONNECTION_ERROR',
        reason: 'LIVE_PROBE_DISABLED',
        probed: false,
        connected: false,
      };
    }
    const result = await this.paypalClient.probeAccessToken(config);
    const current =
      (await this.settingsStore.getRawStored<StoredPaymentPaypal>(SETTINGS_KEYS.PAYMENT_PAYPAL)) ?? {};
    const next: StoredPaymentPaypal = {
      ...current,
      lastProbe: {
        at: new Date().toISOString(),
        ok: result.ok,
        ...(result.ok ? {} : { reason: result.reason }),
      },
    };
    await this.persist(
      adminId,
      SETTINGS_KEYS.PAYMENT_PAYPAL,
      next as Prisma.InputJsonValue,
      ['lastProbe'],
      this.paypalAuditMeta(config.mode, config.mode, this.paypalFlagSnapshot()),
    );
    return {
      connectionStatus: result.ok ? 'CONFIGURED' : 'CONNECTION_ERROR',
      reason: result.ok ? undefined : result.reason,
      probed: true,
      connected: false,
    };
  }

  getSmtp() {
    return this.settingsStore.getSmtpAdminView();
  }

  getSystem() {
    return this.settingsStore.getSystemAdminView();
  }

  getOrder() {
    return this.settingsStore.getOrderAdminView();
  }

  getTelegram() {
    return this.settingsStore.getTelegramAdminView();
  }

  getTurnstile() {
    return this.settingsStore.getTurnstileAdminView();
  }

  getPaymentRuntime() {
    return this.settingsStore.getPaymentRuntimeAdminView();
  }

  getPaymentStrategy() {
    return this.settingsStore.getPaymentStrategyAdminView();
  }

  getPaymentGatewayRuntime(code: 'MEGAPAY' | 'SEPAY') {
    return this.settingsStore.getPaymentGatewayRuntimeAdminView(code);
  }

  async updatePaymentRuntime(adminId: string, dto: UpdatePaymentRuntimeDto) {
    const gateway = dto.defaultGateway;
    if (gateway !== 'MEGAPAY' && gateway !== 'SEPAY') {
      return this.getPaymentRuntime();
    }
    const other = gateway === 'MEGAPAY' ? 'SEPAY' : 'MEGAPAY';
    await this.updatePaymentGatewayRuntime(adminId, gateway, { priority: 1 });
    await this.updatePaymentGatewayRuntime(adminId, other, { priority: 2 });
    return this.getPaymentRuntime();
  }

  async updatePaymentStrategy(adminId: string, dto: UpdatePaymentStrategyDto) {
    if (dto.gateways?.length) {
      const validationError = validateGatewayPriorities(dto.gateways);
      if (validationError) {
        throw new BadRequestException(validationError);
      }

      for (const gateway of dto.gateways) {
        if (gateway.code !== 'MEGAPAY' && gateway.code !== 'SEPAY') continue;
        await this.updatePaymentGatewayRuntime(adminId, gateway.code, {
          priority: gateway.priority,
          enabled: gateway.enabled,
        });
      }
    } else if (dto.defaultGateway === 'MEGAPAY' || dto.defaultGateway === 'SEPAY') {
      await this.updatePaymentRuntime(adminId, { defaultGateway: dto.defaultGateway });
    }

    return this.getPaymentStrategy();
  }

  async updatePaymentGatewayRuntime(
    adminId: string,
    code: 'MEGAPAY' | 'SEPAY',
    dto: UpdatePaymentGatewayRuntimeDto,
  ) {
    if (dto.priority != null) {
      const ordered = this.settingsStore.resolveOrderedPaymentGateways();
      const draft = ordered.map((gateway) =>
        gateway.code === code ? { ...gateway, priority: dto.priority! } : gateway,
      );
      const validationError = validateGatewayPriorities(draft);
      if (validationError) {
        throw new BadRequestException(validationError);
      }
    }

    const key =
      code === 'MEGAPAY'
        ? SETTINGS_KEYS.PAYMENT_GATEWAY_MEGAPAY
        : SETTINGS_KEYS.PAYMENT_GATEWAY_SEPAY;
    const current =
      (await this.settingsStore.getRawStored<StoredPaymentGatewayRuntime>(key)) ?? {};
    const next: StoredPaymentGatewayRuntime = {
      ...current,
      ...dto,
    };
    await this.persist(adminId, key, next as Prisma.InputJsonValue, Object.keys(dto));
    return this.getPaymentGatewayRuntime(code);
  }

  async updateOrder(adminId: string, dto: UpdateOrderSettingsDto) {
    const current =
      (await this.settingsStore.getRawStored<StoredOrder>(SETTINGS_KEYS.ORDER)) ?? {};
    const next: StoredOrder = {
      ...current,
      guestMaxOrderAmount: dto.guestMaxOrderAmount ?? current.guestMaxOrderAmount ?? 0,
      customerMaxOrderAmount: dto.customerMaxOrderAmount ?? current.customerMaxOrderAmount ?? 0,
    };
    await this.persist(adminId, SETTINGS_KEYS.ORDER, next as Prisma.InputJsonValue, [
      'guestMaxOrderAmount',
      'customerMaxOrderAmount',
    ]);
    return this.getOrder();
  }

  async updateTelegram(adminId: string, dto: UpdateTelegramSettingsDto) {
    const current =
      (await this.settingsStore.getRawStored<StoredTelegram>(SETTINGS_KEYS.TELEGRAM)) ?? {};
    const next: StoredTelegram = {
      ...current,
      enabled: dto.enabled ?? current.enabled ?? false,
      chatId: dto.chatId ?? current.chatId,
      botTokenEnc: this.mergeSecretField(dto.botToken, current.botTokenEnc),
    };
    await this.persist(adminId, SETTINGS_KEYS.TELEGRAM, next as Prisma.InputJsonValue, [
      'enabled',
      'chatId',
      'botToken',
    ]);
    return this.getTelegram();
  }

  async updateTurnstile(adminId: string, dto: UpdateTurnstileSettingsDto) {
    const current =
      (await this.settingsStore.getRawStored<StoredTurnstile>(SETTINGS_KEYS.TURNSTILE)) ?? {};
    let secretKeyEnc = current.secretKeyEnc;
    if (dto.clearSecret === true) {
      secretKeyEnc = undefined;
    } else {
      secretKeyEnc = this.mergeSecretField(dto.secretKey, current.secretKeyEnc);
    }
    const next: StoredTurnstile = {
      ...current,
      enabled: dto.enabled ?? current.enabled ?? false,
      siteKey: dto.siteKey !== undefined ? dto.siteKey.trim() : current.siteKey,
      allowedHostnames:
        dto.allowedHostnames !== undefined
          ? dto.allowedHostnames.trim()
          : current.allowedHostnames,
      secretKeyEnc,
    };
    await this.persist(adminId, SETTINGS_KEYS.TURNSTILE, next as Prisma.InputJsonValue, [
      'enabled',
      'siteKey',
      'secretKey',
      'allowedHostnames',
    ]);
    return this.getTurnstile();
  }

  async updatePaymentMegapay(adminId: string, dto: UpdatePaymentGatewayDto) {
    const current =
      (await this.settingsStore.getRawStored<StoredPaymentGateway>(
        SETTINGS_KEYS.PAYMENT_MEGAPAY,
      )) ?? {};

    const next: StoredPaymentGateway = {
      ...current,
      enabled: dto.enabled ?? current.enabled,
      environment: dto.environment ?? current.environment,
      merchantId: dto.merchantId ?? current.merchantId,
      endpoint: dto.endpoint ?? current.endpoint,
      returnUrl: dto.returnUrl ?? current.returnUrl,
      callbackUrl: dto.callbackUrl ?? current.callbackUrl,
      webhookUrl: dto.webhookUrl ?? current.webhookUrl,
      bankCode: dto.bankCode ?? current.bankCode,
      secretKeyEnc: this.mergeSecretField(
        dto.secretKey,
        current.secretKeyEnc,
      ),
      webhookSecretEnc: this.mergeSecretField(
        dto.webhookSecret,
        current.webhookSecretEnc,
      ),
      notifyPublicKeyEnc: this.mergeSecretField(
        dto.notifyPublicKey,
        current.notifyPublicKeyEnc,
      ),
      pgEncodeKeyEnc: this.mergeSecretField(
        dto.pgEncodeKey,
        current.pgEncodeKeyEnc,
      ),
      pgRefundPasswordEnc: this.mergeSecretField(
        dto.pgRefundPassword,
        current.pgRefundPasswordEnc,
      ),
      pgMerchantId: dto.pgMerchantId ?? current.pgMerchantId,
      pgEnvironment: dto.pgEnvironment ?? current.pgEnvironment,
      reqDomain: dto.reqDomain ?? current.reqDomain,
    };

    await this.persist(adminId, SETTINGS_KEYS.PAYMENT_MEGAPAY, next as Prisma.InputJsonValue, [
      'enabled',
      'environment',
      'merchantId',
      'endpoint',
      'returnUrl',
      'callbackUrl',
      'webhookUrl',
      'bankCode',
      'secretKey',
      'webhookSecret',
      'notifyPublicKey',
      'pgEncodeKey',
      'pgRefundPassword',
      'pgMerchantId',
      'pgEnvironment',
      'reqDomain',
    ]);
    return this.getPaymentMegapay();
  }

  async updatePaymentSepay(adminId: string, dto: UpdatePaymentGatewayDto) {
    const current =
      (await this.settingsStore.getRawStored<StoredPaymentGateway>(
        SETTINGS_KEYS.PAYMENT_SEPAY,
      )) ?? {};

    const ipnWasStoredAsHmac =
      current.integrationMode === 'payment_gateway' &&
      !current.ipnSecretEnc &&
      !!current.webhookSecretEnc;
    const next: StoredPaymentGateway = {
      ...current,
      enabled: dto.enabled ?? current.enabled,
      environment: dto.environment ?? current.environment,
      integrationMode: 'legacy_qr',
      merchantId: dto.merchantId ?? current.merchantId,
      paymentMethod: dto.paymentMethod ?? current.paymentMethod,
      bankAccount: dto.bankAccount ?? current.bankAccount,
      bankCode: dto.bankCode ?? current.bankCode,
      accountName: dto.accountName ?? current.accountName,
      qrTemplate: dto.qrTemplate ?? current.qrTemplate,
      webhookUrl: dto.webhookUrl ?? current.webhookUrl,
      apiKeyEnc: this.mergeSecretField(dto.apiKey, current.apiKeyEnc),
      secretKeyEnc: this.mergeSecretField(dto.secretKey, current.secretKeyEnc),
      ipnSecretEnc: this.mergeSecretField(
        dto.ipnSecret,
        ipnWasStoredAsHmac ? current.webhookSecretEnc : current.ipnSecretEnc,
      ),
      webhookSecretEnc: ipnWasStoredAsHmac
        ? this.mergeSecretField(dto.webhookSecret, undefined)
        : this.mergeSecretField(dto.webhookSecret, current.webhookSecretEnc),
    };

    await this.persist(adminId, SETTINGS_KEYS.PAYMENT_SEPAY, next as Prisma.InputJsonValue, [
      'enabled',
      'environment',
      'integrationMode',
      'merchantId',
      'paymentMethod',
      'bankAccount',
      'bankCode',
      'accountName',
      'qrTemplate',
      'webhookUrl',
      'apiKey',
      'secretKey',
      'webhookSecret',
      'ipnSecret',
    ]);
    return this.getPaymentSepay();
  }

  async updateProviderEsale(adminId: string, dto: UpdateProviderEsaleDto) {
    const current =
      (await this.settingsStore.getRawStored<StoredProviderEsale>(
        SETTINGS_KEYS.PROVIDER_ESALE,
      )) ?? {};

    const next: StoredProviderEsale = {
      ...current,
      enabled: dto.enabled ?? current.enabled,
      environment: dto.environment ?? current.environment,
      cardApiUrl: dto.cardApiUrl ?? current.cardApiUrl,
      topupApiUrl: dto.topupApiUrl ?? current.topupApiUrl,
      agencyCode: dto.agencyCode ?? current.agencyCode,
      clientCode: dto.clientCode ?? current.clientCode,
      timeoutMs: dto.timeoutMs ?? current.timeoutMs,
      secretKeyEnc: this.mergeSecretField(dto.secretKey, current.secretKeyEnc),
      privateKeyEnc: this.mergeSecretField(
        dto.privateKey,
        current.privateKeyEnc,
      ),
      publicKeyEnc: this.mergeSecretField(dto.publicKey, current.publicKeyEnc),
    };

    await this.persist(adminId, SETTINGS_KEYS.PROVIDER_ESALE, next as Prisma.InputJsonValue, [
      'enabled',
      'environment',
      'cardApiUrl',
      'topupApiUrl',
      'agencyCode',
      'clientCode',
      'timeoutMs',
      'secretKey',
      'privateKey',
      'publicKey',
    ]);
    return this.getProviderEsale();
  }

  async updateSmtp(adminId: string, dto: UpdateSmtpSettingsDto) {
    const current =
      (await this.settingsStore.getRawStored<StoredSmtp>(SETTINGS_KEYS.SMTP)) ??
      {};

    const next: StoredSmtp = {
      ...current,
      enabled: dto.enabled ?? current.enabled,
      host: dto.host ?? current.host,
      port: dto.port ?? current.port,
      username: dto.username ?? current.username,
      from: dto.from ?? current.from,
      fromName: dto.fromName ?? current.fromName,
      secure: dto.secure ?? current.secure,
      passwordEnc: this.mergeSecretField(dto.password, current.passwordEnc),
    };

    await this.persist(adminId, SETTINGS_KEYS.SMTP, next as Prisma.InputJsonValue, [
      'enabled',
      'host',
      'port',
      'username',
      'from',
      'fromName',
      'secure',
      'password',
    ]);
    this.smtpProvider.clearTransporterCache();
    return this.getSmtp();
  }

  async updateSystem(adminId: string, dto: UpdateSystemSettingsDto) {
    const current =
      (await this.settingsStore.getRawStored<StoredSystem>(
        SETTINGS_KEYS.SYSTEM,
      )) ?? {};

    const next: StoredSystem = {
      ...current,
      siteName: dto.siteName ?? current.siteName,
      publicUrl: dto.publicUrl ?? current.publicUrl,
      providerLowBalanceThreshold:
        dto.providerLowBalanceThreshold ?? current.providerLowBalanceThreshold,
      agentLowBalanceThreshold:
        dto.agentLowBalanceThreshold ?? current.agentLowBalanceThreshold,
      agentRegistrationMode:
        dto.agentRegistrationMode ?? current.agentRegistrationMode ?? 'PUBLIC_APPROVAL',
      customerTopupEnabled:
        dto.customerTopupEnabled ?? current.customerTopupEnabled ?? false,
      customerDataEnabled:
        dto.customerDataEnabled ?? current.customerDataEnabled ?? false,
      customerEsimEnabled:
        dto.customerEsimEnabled ?? current.customerEsimEnabled ?? false,
      esimMaxChargeAmountVnd:
        dto.esimMaxChargeAmountVnd ?? current.esimMaxChargeAmountVnd,
      esimMaxChargeAmountUsd:
        dto.esimMaxChargeAmountUsd ?? current.esimMaxChargeAmountUsd,
      auditLogRetentionDays:
        dto.auditLogRetentionDays ??
        current.auditLogRetentionDays ??
        360,
      agentDepositMinAmount:
        dto.agentDepositMinAmount ?? current.agentDepositMinAmount,
      agentDepositMaxAmount:
        dto.agentDepositMaxAmount ?? current.agentDepositMaxAmount,
    };

    if (
      next.agentDepositMinAmount != null &&
      next.agentDepositMaxAmount != null &&
      next.agentDepositMaxAmount < next.agentDepositMinAmount
    ) {
      throw new BadRequestException(
        'agentDepositMaxAmount must be greater than or equal to agentDepositMinAmount',
      );
    }

    await this.persist(adminId, SETTINGS_KEYS.SYSTEM, next as Prisma.InputJsonValue, [
      'siteName',
      'publicUrl',
      'providerLowBalanceThreshold',
      'agentLowBalanceThreshold',
      'agentRegistrationMode',
      'customerTopupEnabled',
      'customerDataEnabled',
      'customerEsimEnabled',
      'esimMaxChargeAmountVnd',
      'esimMaxChargeAmountUsd',
      'auditLogRetentionDays',
      'agentDepositMinAmount',
      'agentDepositMaxAmount',
    ]);
    return this.getSystem();
  }

  async reloadAll() {
    await this.settingsStore.reload();
    this.smtpProvider.clearTransporterCache();
    return {
      reloaded: true,
      megapayConfigured: this.settingsStore.isMegapayConfigured(),
      sepayConfigured: this.settingsStore.isSepayConfigured(),
      esaleConfigured: this.settingsStore.isEsaleConfigured(),
    };
  }

  async testEsaleConnection() {
    if (!this.settingsStore.isEsaleConfigured()) {
      throw new BadRequestException('eSale chưa được cấu hình');
    }
    const response = await this.esaleClient.getCardList('Card');
    return {
      ok: response.retCode === 1,
      message: response.retMsg ?? (response.retCode === 1 ? 'Kết nối thành công' : 'Kết nối thất bại'),
    };
  }

  async checkEsaleBalance() {
    const provider = await this.providerRepository.findProviderByCode('ESALE');
    if (!provider) {
      throw new NotFoundException('Provider ESALE not found');
    }
    const result = await this.providerHealthService.syncProviderBalance(
      provider.id,
    );
    return {
      balance: result.balance.toFixed(2),
      lastCheckedAt: result.lastCheckedAt.toISOString(),
      lowBalance: result.lowBalance,
    };
  }

  async syncEsaleProducts() {
    const provider = await this.providerRepository.findProviderByCode('ESALE');
    if (!provider) {
      throw new NotFoundException('Provider ESALE not found');
    }
    const adapter = this.providerRegistry.getAdapter(provider.code);
    return adapter.syncProducts();
  }

  async testSmtp(_adminId: string, dto: TestSmtpDto) {
    const config = this.settingsStore.resolveSmtpConfig();
    if (!config?.host) {
      throw new BadRequestException('SMTP chưa được cấu hình');
    }

    const result = await this.smtpProvider.sendEmail({
      to: dto.to,
      subject: 'CardOn — Email thử nghiệm',
      template: 'USER_REGISTER',
      text: 'Đây là email thử nghiệm từ CardOn Admin Settings. Nếu bạn nhận được email này, cấu hình SMTP đang hoạt động.',
      html: '<p>Đây là email thử nghiệm từ <strong>CardOn Admin Settings</strong>.</p><p>Nếu bạn nhận được email này, cấu hình SMTP đang hoạt động.</p>',
    });

    if (!result.ok) {
      throw new BadRequestException(result.error ?? 'Gửi email thất bại');
    }

    return { ok: true, messageId: result.messageId };
  }

  private paypalFlagSnapshot() {
    const view = this.settingsStore.getPaypalAdminView();
    return {
      paypalEsimEnabled: view.paypalEsimEnabled === true,
      customerEsimEnabled: view.customerEsimEnabled === true,
      salesOpen: view.salesOpen === true,
    };
  }

  private paypalAuditMeta(
    modeBefore: string,
    modeAfter: string,
    flags: { paypalEsimEnabled: boolean; customerEsimEnabled: boolean; salesOpen: boolean },
  ) {
    return {
      modeBefore,
      modeAfter,
      paypalEsimEnabledBefore: flags.paypalEsimEnabled,
      paypalEsimEnabledAfter: flags.paypalEsimEnabled,
      customerEsimEnabledBefore: flags.customerEsimEnabled,
      customerEsimEnabledAfter: flags.customerEsimEnabled,
      salesOpenBefore: flags.salesOpen,
      salesOpenAfter: flags.salesOpen,
    };
  }

  private paypalPlain(incoming: string | undefined, existingEnc: string | undefined): string {
    if (incoming && !this.encryption.isMaskedInput(incoming)) return incoming.trim();
    return this.settingsStore.decryptField(existingEnc)?.trim() ?? '';
  }

  private mergeSecretField(
    incoming: string | undefined,
    existingEnc: string | undefined,
  ): string | undefined {
    if (incoming === undefined) return existingEnc;
    if (!incoming || this.encryption.isMaskedInput(incoming)) return existingEnc;
    return this.encryption.encrypt(incoming);
  }

  private async persist(
    adminId: string,
    key: string,
    value: Prisma.InputJsonValue,
    updatedFields: string[],
    extra?: Record<string, unknown>,
  ) {
    await this.settingsRepository.upsert(key, value);
    await this.settingsStore.reload();
    await this.adminAudit.record(
      adminId,
      SETTINGS_AUDIT_ACTION,
      AuditTargetType.USER,
      adminId,
      { settingKey: key, updatedFields, actorId: adminId, ...extra },
    );
  }
}
