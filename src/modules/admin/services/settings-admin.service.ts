import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditTargetType, Prisma } from '@prisma/client';
import { EsaleHttpClient } from '../../provider/adapters/esale/esale.client';
import { ProviderRepository } from '../../provider/repositories/provider.repository';
import { ProviderHealthService } from '../../provider/services/provider-health.service';
import { ProviderRegistryService } from '../../provider/services/provider-registry.service';
import { SmtpEmailProvider } from '../../notification/providers/smtp-email.provider';
import {
  SETTINGS_AUDIT_ACTION,
  SETTINGS_KEYS,
  StoredPaymentGateway,
  StoredProviderEsale,
  StoredOrder,
  StoredPaymentGatewayRuntime,
  StoredSmtp,
  StoredSystem,
  StoredTelegram,
} from '../../settings/entities/settings.constants';
import { SettingsEncryptionService } from '../../settings/services/settings-encryption.service';
import { SettingsRepository } from '../../settings/repositories/settings.repository';
import { SettingsStoreService } from '../../settings/services/settings-store.service';
import { validateGatewayPriorities } from '../../settings/entities/payment-gateway-priority';
import {
  TestSmtpDto,
  UpdatePaymentGatewayDto,
  UpdatePaymentMethodsDto,
  UpdatePaymentRuntimeDto,
  UpdatePaymentStrategyDto,
  UpdatePaymentGatewayRuntimeDto,
  UpdateProviderEsaleDto,
  UpdateSmtpSettingsDto,
  UpdateSystemSettingsDto,
  UpdateOrderSettingsDto,
  UpdateTelegramSettingsDto,
} from '../dto/settings.dto';
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
  ) {}

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
      secretKeyEnc: this.mergeSecretField(
        dto.secretKey,
        current.secretKeyEnc,
      ),
      webhookSecretEnc: this.mergeSecretField(
        dto.webhookSecret,
        current.webhookSecretEnc,
      ),
    };

    await this.persist(adminId, SETTINGS_KEYS.PAYMENT_MEGAPAY, next as Prisma.InputJsonValue, [
      'enabled',
      'environment',
      'merchantId',
      'endpoint',
      'returnUrl',
      'callbackUrl',
      'webhookUrl',
      'secretKey',
      'webhookSecret',
    ]);
    return this.getPaymentMegapay();
  }

  async updatePaymentSepay(adminId: string, dto: UpdatePaymentGatewayDto) {
    const current =
      (await this.settingsStore.getRawStored<StoredPaymentGateway>(
        SETTINGS_KEYS.PAYMENT_SEPAY,
      )) ?? {};

    const next: StoredPaymentGateway = {
      ...current,
      enabled: dto.enabled ?? current.enabled,
      environment: dto.environment ?? current.environment,
      integrationMode: dto.integrationMode ?? current.integrationMode,
      merchantId: dto.merchantId ?? current.merchantId,
      paymentMethod: dto.paymentMethod ?? current.paymentMethod,
      bankAccount: dto.bankAccount ?? current.bankAccount,
      bankCode: dto.bankCode ?? current.bankCode,
      accountName: dto.accountName ?? current.accountName,
      qrTemplate: dto.qrTemplate ?? current.qrTemplate,
      webhookUrl: dto.webhookUrl ?? current.webhookUrl,
      apiKeyEnc: this.mergeSecretField(dto.apiKey, current.apiKeyEnc),
      secretKeyEnc: this.mergeSecretField(dto.secretKey, current.secretKeyEnc),
      webhookSecretEnc: this.mergeSecretField(
        dto.webhookSecret,
        current.webhookSecretEnc,
      ),
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
    };

    await this.persist(adminId, SETTINGS_KEYS.SYSTEM, next as Prisma.InputJsonValue, [
      'siteName',
      'publicUrl',
      'providerLowBalanceThreshold',
      'agentLowBalanceThreshold',
      'agentRegistrationMode',
      'customerTopupEnabled',
      'customerDataEnabled',
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
  ) {
    await this.settingsRepository.upsert(key, value);
    await this.settingsStore.reload();
    await this.adminAudit.record(
      adminId,
      SETTINGS_AUDIT_ACTION,
      AuditTargetType.USER,
      adminId,
      { settingKey: key, updatedFields },
    );
  }
}
