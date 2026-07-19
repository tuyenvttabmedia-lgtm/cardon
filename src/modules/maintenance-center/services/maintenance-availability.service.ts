import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_MAINTENANCE_MODULES,
  MaintenanceMode,
  MaintenanceModuleKey,
  SETTINGS_KEYS,
  StoredMaintenance,
} from '../../settings/entities/settings.constants';
import { SettingsRepository } from '../../settings/repositories/settings.repository';
import { SettingsStoreService } from '../../settings/services/settings-store.service';
import { isStaffRole } from '../entities/maintenance.constants';
export interface MaintenanceCheckContext {
  userRole?: string | null;
  agentId?: string | null;
  isAdminRoute?: boolean;
  module?: MaintenanceModuleKey;
}

@Injectable()
export class MaintenanceAvailabilityService {
  constructor(
    private readonly settingsStore: SettingsStoreService,
    private readonly settingsRepository: SettingsRepository,
  ) {}
  getConfig(): StoredMaintenance & { mode: MaintenanceMode } {
    return this.settingsStore.resolveMaintenanceConfig();
  }

  isActive(): boolean {
    const { mode } = this.getConfig();
    return mode !== 'OFF';
  }

  isModuleEnabled(module: MaintenanceModuleKey): boolean {
    const config = this.getConfig();
    const modules = { ...DEFAULT_MAINTENANCE_MODULES, ...config.modules };
    return modules[module] !== false;
  }

  getPublicStatus() {
    const config = this.getConfig();
    const mode = config.mode ?? 'OFF';
    const active = mode !== 'OFF';
    return {
      mode,
      active,
      readOnly: mode === 'READ_ONLY',
      maintenance: mode === 'MAINTENANCE',
      emergency: mode === 'EMERGENCY',
      reason: config.reason ?? null,
      banner: config.banner ?? {},
      customerPage: config.customerPage ?? {},
      schedule: config.schedule ?? {},
      modules: { ...DEFAULT_MAINTENANCE_MODULES, ...config.modules },
      estimatedFinish:
        config.customerPage?.estimatedFinish ??
        config.schedule?.endAt ??
        config.banner?.endAt ??
        null,
    };
  }

  assertCustomerMutationAllowed(ctx: MaintenanceCheckContext): void {
    if (ctx.isAdminRoute || isStaffRole(ctx.userRole)) return;

    const config = this.getConfig();
    const mode = config.mode ?? 'OFF';

    if (ctx.module && !this.isModuleEnabled(ctx.module)) {
      this.throwUnavailable('Module temporarily unavailable');
    }

    if (mode === 'OFF') return;

    if (mode === 'EMERGENCY') {
      this.throwUnavailable('Emergency maintenance — access restricted');
    }

    if (mode === 'MAINTENANCE') {
      if (ctx.agentId && this.isPartnerBypassAllowed(ctx.agentId, config)) return;
      this.throwUnavailable(config.reason ?? 'System under maintenance');
    }

    if (mode === 'READ_ONLY') {
      if (ctx.agentId) return;
      this.throwUnavailable(config.reason ?? 'System is in read-only mode');
    }
  }

  assertLoginAllowed(role: string): void {
    const mode = this.getConfig().mode ?? 'OFF';
    if (mode === 'EMERGENCY' && role !== 'SUPER_ADMIN') {
      this.throwUnavailable('Emergency maintenance — only SUPER_ADMIN may login');
    }
  }

  applyScheduledTransitions(): StoredMaintenance {
    const config = this.settingsStore.resolveMaintenanceConfig();
    const schedule = config.schedule;
    if (!schedule?.autoEnable && !schedule?.autoDisable) return config;

    const now = Date.now();
    let mode = config.mode ?? 'OFF';
    const start = schedule.startAt ? new Date(schedule.startAt).getTime() : null;
    const end = schedule.endAt ? new Date(schedule.endAt).getTime() : null;

    if (schedule.autoEnable && start && now >= start && mode === 'OFF') {
      mode = 'MAINTENANCE';
    }
    if (schedule.autoDisable && end && now >= end && mode !== 'OFF') {
      mode = 'OFF';
    }

    if (mode !== config.mode) {
      const next = this.settingsStore.mergeMaintenanceConfig({ mode });
      void this.settingsRepository
        .upsert(SETTINGS_KEYS.MAINTENANCE, next as unknown as Prisma.InputJsonValue)
        .then(() => this.settingsStore.reload());
      return next;
    }
    return config;
  }
  private isPartnerBypassAllowed(agentId: string, config: StoredMaintenance): boolean {
    if (!config.partner?.allowDuringMaintenance) return false;
    const list = config.partner.whitelistAgentIds ?? [];
    return list.length === 0 || list.includes(agentId);
  }

  private throwUnavailable(message: string): never {
    throw new ServiceUnavailableException(message);
  }
}
