import { Injectable, Logger } from '@nestjs/common';
import { AuditTargetType } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../auth/audit.service';
import {
  PROVIDER_AUDIT_ACTIONS,
  SYSTEM_PROVIDER_AUDIT_EMAIL,
} from '../entities/provider.constants';

@Injectable()
export class ProviderAuditService {
  private readonly logger = new Logger(ProviderAuditService.name);
  private systemActorId?: string;
  private missingActorLogged = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async recordAttempt(params: {
    orderId: string;
    providerId: string;
    requestId: string;
    attempt: number;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.record(PROVIDER_AUDIT_ACTIONS.PROVIDER_ATTEMPT, params.orderId, {
      providerId: params.providerId,
      requestId: params.requestId,
      attempt: params.attempt,
      ...params.metadata,
    });
  }

  async recordSuccess(params: {
    orderId: string;
    providerId: string;
    requestId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.record(PROVIDER_AUDIT_ACTIONS.PROVIDER_SUCCESS, params.orderId, {
      providerId: params.providerId,
      requestId: params.requestId,
      ...params.metadata,
    });
  }

  async recordFailed(params: {
    orderId: string;
    providerId: string;
    requestId: string;
    failureCode?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.record(PROVIDER_AUDIT_ACTIONS.PROVIDER_FAILED, params.orderId, {
      providerId: params.providerId,
      requestId: params.requestId,
      failureCode: params.failureCode,
      ...params.metadata,
    });
  }

  async recordRetry(params: {
    orderId: string;
    providerId: string;
    requestId: string;
    attempt: number;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.record(PROVIDER_AUDIT_ACTIONS.PROVIDER_RETRY, params.orderId, {
      providerId: params.providerId,
      requestId: params.requestId,
      attempt: params.attempt,
      ...params.metadata,
    });
  }

  private async record(
    action: string,
    orderId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const actorId = await this.resolveSystemActorId();
    if (!actorId) {
      return;
    }
    await this.auditService.recordEvent({
      actorId,
      action,
      targetType: AuditTargetType.ORDER,
      targetId: orderId,
      metadata,
    });
  }

  private async resolveSystemActorId(): Promise<string | null> {
    if (this.systemActorId) {
      return this.systemActorId;
    }
    const user = await this.prisma.user.findFirst({
      where: { email: SYSTEM_PROVIDER_AUDIT_EMAIL },
      select: { id: true },
    });
    if (!user) {
      if (!this.missingActorLogged) {
        this.missingActorLogged = true;
        this.logger.warn(
          `System audit actor not found (${SYSTEM_PROVIDER_AUDIT_EMAIL}) — provider audit events skipped; run ensure-system-audit-user.sql on deploy`,
        );
      }
      return null;
    }
    this.systemActorId = user.id;
    return user.id;
  }
}
