import { Injectable } from '@nestjs/common';
import { HomeServiceType, Prisma, SystemAuditAction, SystemAuditResource, UserRole } from '@prisma/client';
import { AuditLogService } from '../../audit-log/services/audit-log.service';
import { SettingsRepository } from '../../settings/repositories/settings.repository';
import {
  AGENT_MARGIN_SETTINGS_KEY,
  AgentMarginConfig,
  DEFAULT_AGENT_MARGIN_CONFIG,
  ServiceMarginRule,
  normalizeMarginRule,
} from '../entities/agent-margin.constants';

const SETTINGS_DESCRIPTION = 'Cấu hình giá bán đại lý (Product.homeService → biên lợi nhuận CardOn)';

@Injectable()
export class AgentMarginConfigService {
  constructor(
    private readonly settingsRepository: SettingsRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  async getConfig(): Promise<AgentMarginConfig> {
    const row = await this.settingsRepository.findByKey(AGENT_MARGIN_SETTINGS_KEY);
    if (!row?.value || typeof row.value !== 'object') {
      return structuredClone(DEFAULT_AGENT_MARGIN_CONFIG);
    }
    return this.normalize(row.value as Record<string, unknown>);
  }

  getDefaults(): AgentMarginConfig {
    return structuredClone(DEFAULT_AGENT_MARGIN_CONFIG);
  }

  async updateConfig(
    patch: {
      roundTo?: number;
      services?: Partial<Record<HomeServiceType, ServiceMarginRule>>;
    },
    admin: { id: string; email: string; role?: UserRole },
    reason?: string,
  ): Promise<AgentMarginConfig> {
    const prev = await this.getConfig();
    const next: AgentMarginConfig = {
      roundTo: patch.roundTo ?? prev.roundTo,
      applyScope: 'ALL_AGENTS',
      services: { ...prev.services },
    };
    if (patch.services) {
      for (const key of Object.keys(HomeServiceType) as HomeServiceType[]) {
        if (patch.services[key]) {
          next.services[key] = { ...patch.services[key]! };
        }
      }
    }
    await this.settingsRepository.upsert(
      AGENT_MARGIN_SETTINGS_KEY,
      next as unknown as Prisma.InputJsonValue,
      SETTINGS_DESCRIPTION,
    );
    this.auditLog.create({
      resource: SystemAuditResource.PRICING,
      action: SystemAuditAction.UPDATE,
      fieldName: AGENT_MARGIN_SETTINGS_KEY,
      oldValue: prev,
      newValue: next,
      performedBy: admin.id,
      performedEmail: admin.email,
      performedRole: admin.role ?? UserRole.ADMIN,
      reason: reason ?? 'Cập nhật cấu hình giá bán đại lý',
    });
    return next;
  }

  getRuleForService(config: AgentMarginConfig, homeService: HomeServiceType): ServiceMarginRule {
    return config.services[homeService] ?? config.services.GAME_CARD;
  }

  private normalize(raw: Record<string, unknown>): AgentMarginConfig {
    const base = structuredClone(DEFAULT_AGENT_MARGIN_CONFIG);
    if (typeof raw.roundTo === 'number') base.roundTo = raw.roundTo;
    if (raw.applyScope === 'ALL_AGENTS') base.applyScope = 'ALL_AGENTS';

    const services = raw.services;
    if (services && typeof services === 'object') {
      for (const key of Object.keys(HomeServiceType) as HomeServiceType[]) {
        const row = (services as Record<string, unknown>)[key];
        base.services[key] = normalizeMarginRule(
          row && typeof row === 'object' ? (row as Record<string, unknown>) : undefined,
          base.services[key],
        );
      }
    }
    return base;
  }
}
