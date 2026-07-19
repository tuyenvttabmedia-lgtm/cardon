import { Injectable } from '@nestjs/common';
import { CmsRepository } from '../../cms/repositories/cms.repository';
import { ProviderRepository } from '../../provider/repositories/provider.repository';
import { ProviderRuntimeSettingsRepository } from '../../provider/repositories/provider-runtime-settings.repository';
import { SettingsStoreService } from '../../settings/services/settings-store.service';
import { AuditSnapshotKey } from '../entities/audit-log.constants';

@Injectable()
export class AuditSnapshotService {
  constructor(
    private readonly settingsStore: SettingsStoreService,
    private readonly providerRuntimeSettings: ProviderRuntimeSettingsRepository,
    private readonly providerRepository: ProviderRepository,
    private readonly cmsRepository: CmsRepository,
  ) {}

  async capture(
    snapshot: AuditSnapshotKey,
    params: Record<string, string> = {},
  ): Promise<{ data: Record<string, unknown>; resourceId?: string; resourceName?: string }> {
    switch (snapshot) {
      case AuditSnapshotKey.PAYMENT_MEGAPAY:
        return { data: this.settingsStore.getMegapayAdminView(), resourceName: 'MegaPay' };
      case AuditSnapshotKey.PAYMENT_SEPAY:
        return { data: this.settingsStore.getSepayAdminView(), resourceName: 'SePay' };
      case AuditSnapshotKey.PAYMENT_METHODS:
        return {
          data: { methods: this.settingsStore.getPaymentMethodsAdminView() },
          resourceName: 'Payment Methods',
        };
      case AuditSnapshotKey.PAYMENT_RUNTIME:
        return {
          data: this.settingsStore.getPaymentRuntimeAdminView(),
          resourceName: 'Payment Runtime',
        };
      case AuditSnapshotKey.PAYMENT_STRATEGY:
        return {
          data: this.settingsStore.getPaymentStrategyAdminView(),
          resourceName: 'Payment Strategy',
        };
      case AuditSnapshotKey.PAYMENT_GATEWAY_RUNTIME: {
        const code = (params.code ?? 'MEGAPAY').toUpperCase() as 'MEGAPAY' | 'SEPAY';
        return {
          data: this.settingsStore.getPaymentGatewayRuntimeAdminView(code),
          resourceId: code,
          resourceName: code,
        };
      }
      case AuditSnapshotKey.PROVIDER_ESALE:
        return {
          data: this.settingsStore.getEsaleAdminView(),
          resourceName: 'eSale Provider',
        };
      case AuditSnapshotKey.SMTP:
        return { data: this.settingsStore.getSmtpAdminView(), resourceName: 'SMTP' };
      case AuditSnapshotKey.SYSTEM:
        return { data: this.settingsStore.getSystemAdminView(), resourceName: 'System' };
      case AuditSnapshotKey.ORDER:
        return { data: this.settingsStore.getOrderAdminView(), resourceName: 'Order Settings' };
      case AuditSnapshotKey.TELEGRAM:
        return { data: this.settingsStore.getTelegramAdminView(), resourceName: 'Telegram' };
      case AuditSnapshotKey.PROVIDER_RUNTIME: {
        const providerId = params.id;
        if (!providerId) {
          return { data: {} };
        }
        const provider = await this.providerRepository.findProviderById(providerId);
        const row = await this.providerRuntimeSettings.findByProviderId(providerId);
        return {
          data: {
            maintenanceMode: row?.maintenanceMode ?? false,
            reason: row?.reason ?? null,
            startAt: row?.startAt?.toISOString() ?? null,
            endAt: row?.endAt?.toISOString() ?? null,
          },
          resourceId: providerId,
          resourceName: provider?.name ?? providerId,
        };
      }
      case AuditSnapshotKey.CMS_SEO:
        return {
          data: (await this.cmsRepository.getSeoSettings()) as Record<string, unknown>,
          resourceName: 'SEO Settings',
        };
      default:
        return { data: {} };
    }
  }

  normalizeAfterState(result: unknown): Record<string, unknown> {
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      return result as Record<string, unknown>;
    }
    return { value: result };
  }
}
