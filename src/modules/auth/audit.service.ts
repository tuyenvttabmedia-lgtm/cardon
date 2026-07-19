import { Injectable } from '@nestjs/common';
import { AuditTargetType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditAction } from './auth.constants';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async recordSecurityEvent(params: {
    userId: string;
    action: AuditAction;
    ipAddress?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.recordEvent({
      actorId: params.userId,
      action: params.action,
      targetType: AuditTargetType.USER,
      targetId: params.userId,
      ipAddress: params.ipAddress,
      metadata: params.metadata,
    });
  }

  async recordEvent(params: {
    actorId: string;
    action: string;
    targetType: AuditTargetType;
    targetId: string;
    ipAddress?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        adminId: params.actorId,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        ipAddress: params.ipAddress,
        metadata: (params.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}
