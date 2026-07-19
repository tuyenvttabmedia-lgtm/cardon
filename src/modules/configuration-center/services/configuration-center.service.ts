import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SystemAuditResource, UserRole } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { SettingsAdminService } from '../../admin/services/settings-admin.service';
import { TelegramNotificationService } from '../../notification/providers/telegram-notification.service';
import { SETTINGS_KEYS } from '../../settings/entities/settings.constants';
import { SettingsStoreService } from '../../settings/services/settings-store.service';
import {
  CONFIGURATION_SEARCH_INDEX,
  ConfigurationModuleId,
  ConfigurationModuleStatus,
  ConfigurationSearchEntry,
  EXPORTABLE_MODULES,
  ExportableModule,
  MODULE_AUDIT_RESOURCE,
} from '../entities/configuration-center.constants';
import { ConfigurationImportDto, ConfigurationTestTelegramDto } from '../dto/configuration-center.dto';

@Injectable()
export class ConfigurationCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsStore: SettingsStoreService,
    private readonly settingsAdmin: SettingsAdminService,
    private readonly telegram: TelegramNotificationService,
    private readonly configService: ConfigService,
  ) {}

  async getOverview() {
    const modules = await this.buildModuleSummaries();
    const warnings = this.buildDependencyWarnings();
    const environment = process.env.NODE_ENV ?? 'development';
    const dbSettingsCount = await this.prisma.systemSetting.count();
    const lastAudit = await this.prisma.systemAuditLog.findFirst({
      where: {
        resource: {
          in: [
            SystemAuditResource.PAYMENT_GATEWAY,
            SystemAuditResource.PROVIDER,
            SystemAuditResource.SMTP,
            SystemAuditResource.FEATURE_FLAG,
            SystemAuditResource.SETTING,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const configuredCount = modules.filter((m) => m.status === 'configured' || m.status === 'production_ready').length;
    const warningCount = modules.filter((m) => m.status === 'warning' || m.status === 'needs_attention').length;
    const productionReady = modules.every(
      (m) => m.status === 'disabled' || m.status === 'production_ready' || m.status === 'configured',
    ) && warningCount === 0;

    return {
      summary: {
        configuredModules: configuredCount,
        totalModules: modules.length,
        warnings: warnings.length + warningCount,
        secretsProtected: true,
        environment,
        databaseSettings: dbSettingsCount,
        pendingChanges: 0,
        lastModifiedAt: lastAudit?.createdAt.toISOString() ?? null,
        lastModifiedBy: lastAudit?.performedEmail ?? null,
        lastBackupAt: null,
        productionReady,
      },
      modules,
      warnings,
      dependencies: warnings,
    };
  }

  search(q: string): ConfigurationSearchEntry[] {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return CONFIGURATION_SEARCH_INDEX.filter(
      (entry) =>
        entry.label.toLowerCase().includes(needle) ||
        entry.keywords.some((k) => k.includes(needle) || needle.includes(k)),
    ).slice(0, 20);
  }

  async getModuleAuditMeta(module: ConfigurationModuleId) {
    const resource = MODULE_AUDIT_RESOURCE[module];
    if (!resource) {
      return { module, lastModifiedAt: null, modifiedBy: null, source: null };
    }
    const row = await this.prisma.systemAuditLog.findFirst({
      where: { resource },
      orderBy: { createdAt: 'desc' },
    });
    const settingKey = this.moduleSettingKey(module);
    return {
      module,
      lastModifiedAt: row?.createdAt.toISOString() ?? null,
      modifiedBy: row?.performedEmail ?? null,
      modifiedByRole: row?.performedRole ?? null,
      source: settingKey && this.settingsStore.hasDbSetting(settingKey) ? 'database' : 'environment',
      secretsProtected: true,
      developerOverride: process.env.NODE_ENV !== 'production',
    };
  }

  async exportModule(module: ExportableModule, includeSecrets: boolean, role: UserRole) {
    if (!EXPORTABLE_MODULES.includes(module)) {
      throw new NotFoundException('Module not exportable');
    }
    const allowSecrets = includeSecrets && role === UserRole.SUPER_ADMIN;
    const data = await this.loadModuleData(module, allowSecrets);
    return { module, exportedAt: new Date().toISOString(), includeSecrets: allowSecrets, data };
  }

  async importModule(
    module: ExportableModule,
    dto: ConfigurationImportDto,
    adminId: string,
    role: UserRole,
  ) {
    if (!EXPORTABLE_MODULES.includes(module)) {
      throw new NotFoundException('Module not importable');
    }
    if (dto.include_secrets && role !== UserRole.SUPER_ADMIN) {
      throw new BadRequestException('Only SUPER_ADMIN can import secrets');
    }
    await this.applyModuleImport(module, dto.data, adminId);
    await this.settingsStore.reload();
    return { ok: true, module };
  }

  async testMegapay() {
    const view = this.settingsStore.getMegapayAdminView() as {
      enabled?: boolean;
      endpoint?: string;
      merchantId?: string;
      configured?: boolean;
    };
    if (!this.settingsStore.isMegapayConfigured()) {
      throw new BadRequestException('MegaPay chưa được cấu hình đầy đủ');
    }
    const endpoint = String(view.endpoint ?? '').trim();
    if (!endpoint || !/^https?:\/\//i.test(endpoint)) {
      throw new BadRequestException('MegaPay endpoint URL không hợp lệ');
    }
    const started = Date.now();
    try {
      const res = await fetch(endpoint, { method: 'HEAD', signal: AbortSignal.timeout(10_000) });
      return {
        ok: res.ok || res.status === 405 || res.status === 404,
        latencyMs: Date.now() - started,
        httpStatus: res.status,
        message: res.ok ? 'Kết nối endpoint thành công' : `Endpoint phản hồi HTTP ${res.status}`,
      };
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Không thể kết nối MegaPay endpoint',
      );
    }
  }

  async testSepay() {
    if (!this.settingsStore.isSepayConfigured()) {
      throw new BadRequestException('SePay chưa được cấu hình đầy đủ');
    }
    const config = this.settingsStore.resolveSepayConfig();
    if (config.mode === 'payment_gateway') {
      const started = Date.now();
      const apiBase =
        config.environment === 'sandbox'
          ? 'https://pgapi-sandbox.sepay.vn'
          : 'https://pgapi.sepay.vn';
      const auth = Buffer.from(
        `${config.merchantId}:${config.merchantSecretKey}`,
      ).toString('base64');
      const res = await fetch(`${apiBase}/v1/orders?per_page=1`, {
        headers: { Authorization: `Basic ${auth}` },
        signal: AbortSignal.timeout(15_000),
      });
      return {
        ok: res.ok || res.status === 404,
        message:
          res.ok || res.status === 404
            ? `SePay PG ${config.environment} kết nối OK (HTTP ${res.status})`
            : `SePay PG phản hồi HTTP ${res.status}`,
        latencyMs: Date.now() - started,
        httpStatus: res.status,
      };
    }
    const view = this.settingsStore.getSepayAdminView() as { bankAccount?: string; configured?: boolean };
    if (!view.bankAccount?.trim()) {
      throw new BadRequestException('SePay bank account chưa cấu hình');
    }
    return {
      ok: true,
      message: 'SePay credentials hợp lệ (bank account configured)',
      latencyMs: 0,
    };
  }

  async testTelegram(dto: ConfigurationTestTelegramDto) {
    const cfg = this.settingsStore.resolveTelegramConfig();
    if (!cfg?.botTokenEnc || !cfg.chatId) {
      throw new BadRequestException('Telegram chưa được cấu hình hoặc đang tắt');
    }
    const token = typeof cfg.botTokenEnc === 'string' ? cfg.botTokenEnc : '';
    const started = Date.now();
    const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!meRes.ok) {
      const body = await meRes.text();
      throw new BadRequestException(`Telegram getMe failed: ${body.slice(0, 200)}`);
    }
    const text = dto.message ?? 'CardOn — Telegram test message from Configuration Center';
    const sent = await this.telegram.sendMessage(token, cfg.chatId, text);
    if (!sent) {
      throw new BadRequestException('Gửi tin nhắn Telegram thất bại');
    }
    return { ok: true, latencyMs: Date.now() - started, message: 'Telegram test message sent' };
  }

  async testWebhook() {
    const megapay = this.settingsStore.getMegapayAdminView() as { callbackUrl?: string; webhookUrl?: string };
    const sepay = this.settingsStore.getSepayAdminView() as { webhookUrl?: string };
    const url = String(megapay.callbackUrl ?? megapay.webhookUrl ?? sepay.webhookUrl ?? '').trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      throw new BadRequestException('Webhook/callback URL chưa cấu hình hoặc không hợp lệ');
    }
    const started = Date.now();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Cardon-Test': 'configuration-center' },
        body: JSON.stringify({ test: true, source: 'configuration-center' }),
        signal: AbortSignal.timeout(10_000),
      });
      return {
        ok: res.status < 500,
        latencyMs: Date.now() - started,
        httpStatus: res.status,
        message: `Webhook endpoint responded HTTP ${res.status}`,
      };
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Webhook test failed',
      );
    }
  }

  async testProvider() {
    return this.settingsAdmin.testEsaleConnection();
  }

  private async buildModuleSummaries() {
    const megapay = this.settingsStore.getMegapayAdminView() as { enabled?: boolean; configured?: boolean };
    const sepay = this.settingsStore.getSepayAdminView() as { enabled?: boolean; configured?: boolean };
    const smtp = this.settingsStore.getSmtpAdminView() as { enabled?: boolean; host?: string };
    const telegram = this.settingsStore.getTelegramAdminView() as { enabled?: boolean; chatId?: string };
    const esale = this.settingsStore.getEsaleAdminView() as { enabled?: boolean; configured?: boolean };
    const system = this.settingsStore.getSystemAdminView() as { siteName?: string };

    return [
      this.moduleRow('payment', 'Payment', this.paymentStatus(megapay, sepay)),
      this.moduleRow('providers', 'Providers', esale.enabled && esale.configured ? 'production_ready' : esale.enabled ? 'needs_attention' : 'disabled'),
      this.moduleRow('orders', 'Orders', 'configured'),
      this.moduleRow('smtp', 'SMTP', smtp.host ? (smtp.enabled === false ? 'disabled' : 'configured') : 'needs_attention'),
      this.moduleRow('telegram', 'Telegram', telegram.enabled ? (telegram.chatId ? 'configured' : 'needs_attention') : 'disabled'),
      this.moduleRow('webhooks', 'Webhooks', megapay.configured || sepay.configured ? 'configured' : 'needs_attention'),
      this.moduleRow('security', 'Security', 'production_ready'),
      this.moduleRow('integrations', 'Integrations', 'configured'),
      this.moduleRow('feature-flags', 'Feature Flags', system.siteName ? 'configured' : 'needs_attention'),
      this.moduleRow('maintenance', 'Maintenance', this.maintenanceStatus()),
      this.moduleRow('backup', 'Backup', 'configured'),
      this.moduleRow('system', 'System', 'configured'),
      this.moduleRow('audit', 'Audit', 'configured'),
      this.moduleRow('advanced', 'Advanced', 'configured'),
    ];
  }

  private maintenanceStatus(): ConfigurationModuleStatus {
    const config = this.settingsStore.resolveMaintenanceConfig();
    const mode = config.mode ?? 'OFF';
    if (mode === 'OFF') return 'configured';
    if (mode === 'READ_ONLY') return 'warning';
    if (mode === 'MAINTENANCE' || mode === 'EMERGENCY') return 'needs_attention';
    return 'configured';
  }

  private paymentStatus(
    megapay: { enabled?: boolean; configured?: boolean },
    sepay: { enabled?: boolean; configured?: boolean },
  ): ConfigurationModuleStatus {
    const anyEnabled = Boolean(megapay.enabled || sepay.enabled);
    const anyConfigured = Boolean(megapay.configured || sepay.configured);
    if (!anyEnabled) return 'disabled';
    if (!anyConfigured) return 'needs_attention';
    return 'production_ready';
  }

  private moduleHref(id: ConfigurationModuleId): string {
    const aliases: Partial<Record<ConfigurationModuleId, string>> = {
      'feature-flags': '/configuration/system',
      advanced: '/configuration/system',
      security: '/configuration/system',
      integrations: '/configuration',
    };
    if (aliases[id]) return aliases[id]!;
    return `/configuration/${id}`;
  }

  private moduleRow(id: ConfigurationModuleId, label: string, status: ConfigurationModuleStatus) {
    return { id, label, status, href: this.moduleHref(id) };
  }

  private buildDependencyWarnings() {
    const warnings: Array<{ id: string; message: string; severity: 'warning' | 'critical' }> = [];
    const telegram = this.settingsStore.getTelegramAdminView() as { enabled?: boolean };
    const smtp = this.settingsStore.getSmtpAdminView() as { enabled?: boolean; host?: string };
    const megapay = this.settingsStore.getMegapayAdminView() as { enabled?: boolean };
    const sepay = this.settingsStore.getSepayAdminView() as { enabled?: boolean };
    const esale = this.settingsStore.getEsaleAdminView() as { enabled?: boolean };

    if (!telegram.enabled) {
      warnings.push({ id: 'telegram-off', message: 'Telegram disabled → Notification Telegram unavailable', severity: 'warning' });
    }
    if (!smtp.enabled || !smtp.host) {
      warnings.push({ id: 'smtp-off', message: 'SMTP disabled → Email queue affected', severity: 'warning' });
    }
    if (!megapay.enabled && !sepay.enabled) {
      warnings.push({ id: 'payment-off', message: 'MegaPay & SePay disabled → Payment unavailable', severity: 'critical' });
    }
    if (!esale.enabled) {
      warnings.push({ id: 'provider-off', message: 'Providers disabled → Card purchase unavailable', severity: 'critical' });
    }
    return warnings;
  }

  private moduleSettingKey(module: ConfigurationModuleId): string | null {
    const map: Partial<Record<ConfigurationModuleId, string>> = {
      payment: SETTINGS_KEYS.PAYMENT_MEGAPAY,
      providers: SETTINGS_KEYS.PROVIDER_ESALE,
      smtp: SETTINGS_KEYS.SMTP,
      system: SETTINGS_KEYS.SYSTEM,
      orders: SETTINGS_KEYS.ORDER,
      telegram: SETTINGS_KEYS.TELEGRAM,
      maintenance: SETTINGS_KEYS.MAINTENANCE,
      'feature-flags': SETTINGS_KEYS.SYSTEM,
    };
    return map[module] ?? null;
  }

  private async loadModuleData(module: ExportableModule, includeSecrets: boolean) {
    switch (module) {
      case 'payment':
        return {
          megapay: this.settingsStore.getMegapayAdminView(),
          sepay: this.settingsStore.getSepayAdminView(),
          methods: this.settingsStore.getPaymentMethodsAdminView(),
          strategy: this.settingsStore.getPaymentStrategyAdminView(),
        };
      case 'smtp':
        return this.settingsStore.getSmtpAdminView();
      case 'telegram':
        return this.settingsStore.getTelegramAdminView();
      case 'providers':
        return this.settingsStore.getEsaleAdminView();
      case 'system':
      case 'feature-flags':
        return this.settingsStore.getSystemAdminView();
      case 'orders':
        return this.settingsStore.getOrderAdminView();
      default:
        throw new NotFoundException('Unknown module');
    }
  }

  private async applyModuleImport(module: ExportableModule, data: Record<string, unknown>, adminId: string) {
    switch (module) {
      case 'smtp':
        await this.settingsAdmin.updateSmtp(adminId, data as never);
        break;
      case 'telegram':
        await this.settingsAdmin.updateTelegram(adminId, data as never);
        break;
      case 'system':
      case 'feature-flags':
        await this.settingsAdmin.updateSystem(adminId, data as never);
        break;
      case 'orders':
        await this.settingsAdmin.updateOrder(adminId, data as never);
        break;
      case 'providers':
        await this.settingsAdmin.updateProviderEsale(adminId, data as never);
        break;
      case 'payment':
        if (data.megapay) await this.settingsAdmin.updatePaymentMegapay(adminId, data.megapay as never);
        if (data.sepay) await this.settingsAdmin.updatePaymentSepay(adminId, data.sepay as never);
        break;
      default:
        throw new BadRequestException('Import not supported for module');
    }
  }
}
