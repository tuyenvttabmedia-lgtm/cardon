import { SetMetadata } from '@nestjs/common';
import { SystemAuditAction, SystemAuditResource } from '@prisma/client';
import {
  AUDIT_METADATA_KEY,
  AuditSnapshotKey,
} from '../entities/audit-log.constants';

export interface AuditOptions {
  resource: SystemAuditResource;
  action: SystemAuditAction;
  snapshot?: AuditSnapshotKey;
  resourceIdParam?: string;
  resourceName?: string;
  reasonField?: string;
  detectEnableDisable?: boolean;
}

export const Audit = (options: AuditOptions) =>
  SetMetadata(AUDIT_METADATA_KEY, options);
