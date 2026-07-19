import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  Prisma,
  SystemActivityEventCategory,
  SystemActivityEventType,
  SystemActivitySeverity,
  SystemActivitySource,
  SystemAuditAction,
  SystemAuditResource,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../database/prisma.service';
import { ActivityEventDispatcher } from '../../activity-event/activity-event-dispatcher.service';
import { AuditLogService } from '../../audit-log/services/audit-log.service';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { TelegramNotificationService } from '../../notification/providers/telegram-notification.service';
import { SETTINGS_KEYS, StoredMaintenance } from '../../settings/entities/settings.constants';
import { SettingsRepository } from '../../settings/repositories/settings.repository';
import { SettingsStoreService } from '../../settings/services/settings-store.service';
import {
  MaintenancePreviewDto,
  MaintenanceScheduleApplyDto,
  UpdateMaintenanceDto,
} from '../dto/maintenance.dto';
import { MaintenanceAvailabilityService } from './maintenance-availability.service';

export interface OperationContext {
  ipAddress?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
}

@Injectable()
export class MaintenanceCenterService {
  constructor(
    private readonly settingsStore: SettingsStoreService,
    private readonly settingsRepository: SettingsRepository,
    private readonly prisma: PrismaService,
    private readonly availability: MaintenanceAvailabilityService,
    private readonly activityDispatcher: ActivityEventDispatcher,
    private readonly auditLogService: AuditLogService,
    private readonly telegram: TelegramNotificationService,
  ) {}

  async getDashboard() {
    this.availability.applyScheduledTransitions();
    const config = this.settingsStore.resolveMaintenanceConfig();
    const publicStatus = this.availability.getPublicStatus();
    const affectedModules = Object.entries(publicStatus.modules)
      .filter(([, enabled]) => !enabled)
      .map(([key]) => key);
    const scheduledTasks =
      config.schedule?.autoEnable || config.schedule?.autoDisable
        ? [
            {
              startAt: config.schedule?.startAt ?? null,
              endAt: config.schedule?.endAt ?? null,
              timezone: config.schedule?.timezone ?? 'Asia/Ho_Chi_Minh',
              autoEnable: config.schedule?.autoEnable ?? false,
              autoDisable: config.schedule?.autoDisable ?? false,
            },
          ]
        : [];

    return {
      config,
      summary: {
        status: config.mode ?? 'OFF',
        readOnly: (config.mode ?? 'OFF') === 'READ_ONLY',
        affectedModules,
        currentBanner: config.banner ?? {},
        scheduledTasks,
        historyCount: config.history?.length ?? 0,
        active: publicStatus.active,
      },
      publicStatus,
    };
  }

  preview(dto: MaintenancePreviewDto) {
    const config = this.settingsStore.resolveMaintenanceConfig();
    return {
      mode: dto.mode ?? config.mode ?? 'OFF',
      banner: { ...config.banner, ...dto.banner },
      preview: {
        desktop: dto.banner?.title ?? config.banner?.title,
        mobile: dto.banner?.description ?? config.banner?.description,
      },
    };
  }

  async update(
    user: AuthenticatedUser,
    dto: UpdateMaintenanceDto,
    ctx: OperationContext,
  ) {
    await this.verifySuperAdminPassword(user, dto.password);
    const previous = this.settingsStore.resolveMaintenanceConfig();
    const next: StoredMaintenance = {
      ...previous,
      mode: dto.mode ?? previous.mode ?? 'OFF',
      reason: dto.reason ?? previous.reason,
      modules: { ...previous.modules, ...dto.modules },
      banner: { ...previous.banner, ...dto.banner },
      schedule: { ...previous.schedule, ...dto.schedule },
      partner: { ...previous.partner, ...dto.partner },
      customerPage: { ...previous.customerPage, ...dto.customerPage },
      lastChangedAt: new Date().toISOString(),
      lastChangedBy: user.id,
      lastChangedEmail: user.email,
    };

    const historyEntry = {
      id: randomUUID(),
      action: previous.mode === next.mode ? 'UPDATE' : 'MODE_CHANGE',
      mode: next.mode ?? 'OFF',
      reason: next.reason,
      performedBy: user.id,
      performedEmail: user.email,
      at: new Date().toISOString(),
    };
    next.history = [historyEntry, ...(previous.history ?? [])].slice(0, 100);

    await this.persist(next);
    this.logChange(user, ctx, previous, next);
    if ((next.mode ?? 'OFF') !== 'OFF' && (previous.mode ?? 'OFF') === 'OFF') {
      await this.notifyTelegram(next);
    }
    return this.getDashboard();
  }

  async applySchedule(
    user: AuthenticatedUser,
    dto: MaintenanceScheduleApplyDto,
    ctx: OperationContext,
  ) {
    await this.verifySuperAdminPassword(user, dto.password);
    const previous = this.settingsStore.resolveMaintenanceConfig();
    const next: StoredMaintenance = {
      ...previous,
      schedule: {
        ...previous.schedule,
        startAt: dto.startAt ?? previous.schedule?.startAt ?? null,
        endAt: dto.endAt ?? previous.schedule?.endAt ?? null,
        timezone: dto.timezone ?? previous.schedule?.timezone ?? 'Asia/Ho_Chi_Minh',
        autoEnable: dto.autoEnable ?? previous.schedule?.autoEnable ?? false,
        autoDisable: dto.autoDisable ?? previous.schedule?.autoDisable ?? false,
      },
      lastChangedAt: new Date().toISOString(),
      lastChangedBy: user.id,
      lastChangedEmail: user.email,
    };
    await this.persist(next);
    this.logChange(user, ctx, previous, next, 'schedule');
    return this.getDashboard();
  }

  private async persist(config: StoredMaintenance) {
    await this.settingsRepository.upsert(
      SETTINGS_KEYS.MAINTENANCE,
      config as unknown as Prisma.InputJsonValue,
    );
    await this.settingsStore.reload();
  }

  private async verifySuperAdminPassword(user: AuthenticatedUser, password: string) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only SUPER_ADMIN can change maintenance settings');
    }
    const row = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    if (!row?.passwordHash) throw new BadRequestException('Invalid credentials');
    const ok = await bcrypt.compare(password, row.passwordHash);
    if (!ok) throw new BadRequestException('Password confirmation failed');
  }

  private logChange(
    user: AuthenticatedUser,
    ctx: OperationContext,
    previous: StoredMaintenance,
    next: StoredMaintenance,
    field = 'maintenance',
  ) {
    const enabled = (next.mode ?? 'OFF') !== 'OFF';
    const wasEnabled = (previous.mode ?? 'OFF') !== 'OFF';
    const modeChanged = (previous.mode ?? 'OFF') !== (next.mode ?? 'OFF');

    if (modeChanged) {
      this.activityDispatcher.dispatch({
        eventType:
          enabled && !wasEnabled
            ? SystemActivityEventType.MAINTENANCE_ENABLED
            : !enabled && wasEnabled
              ? SystemActivityEventType.MAINTENANCE_DISABLED
              : SystemActivityEventType.MAINTENANCE_ENABLED,
        eventCategory: SystemActivityEventCategory.SYSTEM,
        severity: enabled ? SystemActivitySeverity.WARNING : SystemActivitySeverity.INFO,
        source: SystemActivitySource.ADMIN,
        resource: 'maintenance',
        title: enabled ? 'Maintenance Enabled' : 'Maintenance Disabled',
        description: `${previous.mode ?? 'OFF'} → ${next.mode ?? 'OFF'}${next.reason ? `: ${next.reason}` : ''}`,
        performedBy: user.id,
        performedEmail: user.email,
        performedRole: user.role,
        ipAddress: ctx.ipAddress ?? null,
        userAgent: ctx.userAgent ?? null,
        correlationId: ctx.correlationId ?? null,
        metadata: { mode: next.mode, reason: next.reason },
      });
    }

    this.auditLogService.create({
      resource: SystemAuditResource.SETTING,
      resourceId: SETTINGS_KEYS.MAINTENANCE,
      resourceName: 'maintenance',
      action: SystemAuditAction.UPDATE,
      fieldName: field,
      oldValue: { mode: previous.mode, reason: previous.reason },
      newValue: { mode: next.mode, reason: next.reason },
      performedBy: user.id,
      performedEmail: user.email,
      performedRole: user.role as UserRole,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
      correlationId: ctx.correlationId ?? null,
      reason: next.reason ?? 'Maintenance center update',
    });
  }

  private async notifyTelegram(config: StoredMaintenance) {
    if ((config.mode ?? 'OFF') === 'OFF') return;
    const tg = this.settingsStore.resolveTelegramConfig();
    if (!tg?.botTokenEnc || !tg.chatId) return;
    const token = typeof tg.botTokenEnc === 'string' ? tg.botTokenEnc : '';
    await this.telegram.sendMessage(
      token,
      tg.chatId,
      `<b>Maintenance ${config.mode}</b>\n${config.reason ?? 'Platform maintenance updated'}`,
    );
  }
}
