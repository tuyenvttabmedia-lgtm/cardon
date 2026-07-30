import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  AUDIT_LOG_RETENTION_DAYS_DEFAULT,
  AUDIT_LOG_RETENTION_DAYS_MAX,
  AUDIT_LOG_RETENTION_DAYS_MIN,
} from '../../settings/entities/settings.constants';
import { SettingsStoreService } from '../../settings/services/settings-store.service';
import { AuditLogRepository } from '../repositories/audit-log.repository';

@Injectable()
export class AuditLogRetentionService implements OnModuleInit {
  private readonly logger = new Logger(AuditLogRetentionService.name);

  constructor(
    private readonly repository: AuditLogRepository,
    private readonly settingsStore: SettingsStoreService,
  ) {}

  onModuleInit() {
    const dayMs = 86_400_000;
    void this.purge();
    setInterval(() => void this.purge(), dayMs);
  }

  private resolveRetentionDays(): number {
    const raw = this.settingsStore.resolveSystemConfig().auditLogRetentionDays;
    const days =
      typeof raw === 'number' && Number.isFinite(raw)
        ? Math.trunc(raw)
        : AUDIT_LOG_RETENTION_DAYS_DEFAULT;
    return Math.min(
      AUDIT_LOG_RETENTION_DAYS_MAX,
      Math.max(AUDIT_LOG_RETENTION_DAYS_MIN, days),
    );
  }

  private async purge() {
    try {
      const days = this.resolveRetentionDays();
      const before = new Date(Date.now() - days * 86_400_000);
      const result = await this.repository.purgeOlderThan(before);
      const total = result.systemAudit + result.audit;
      if (total > 0) {
        this.logger.log(
          `Purged audit logs older than ${days}d: system_audit=${result.systemAudit} audit=${result.audit}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Audit log retention purge failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
