import { Injectable } from '@nestjs/common';
import { AuditTargetType } from '@prisma/client';
import { AuditService } from '../../auth/audit.service';

@Injectable()
export class AdminAuditService {
  constructor(private readonly auditService: AuditService) {}

  record(
    adminId: string,
    action: string,
    targetType: AuditTargetType,
    targetId: string,
    metadata?: Record<string, unknown>,
    ipAddress?: string,
  ) {
    return this.auditService.recordEvent({
      actorId: adminId,
      action,
      targetType,
      targetId,
      metadata,
      ipAddress,
    });
  }
}
