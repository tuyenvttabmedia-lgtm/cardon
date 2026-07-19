import { Injectable } from '@nestjs/common';
import { AuditTargetType } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../auth/audit.service';
import {
  ORDER_AUDIT_ACTIONS,
  SYSTEM_AUDIT_ACTOR_EMAIL,
} from '../entities/order.constants';

@Injectable()
export class OrderAuditService {
  private systemActorId?: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async recordOrderCreated(params: {
    orderId: string;
    actorUserId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const actorId =
      params.actorUserId ?? (await this.resolveSystemActorId());

    await this.auditService.recordEvent({
      actorId,
      action: ORDER_AUDIT_ACTIONS.ORDER_CREATED,
      targetType: AuditTargetType.ORDER,
      targetId: params.orderId,
      metadata: params.metadata,
    });
  }

  async recordOrderExpired(params: {
    orderId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const actorId = await this.resolveSystemActorId();

    await this.auditService.recordEvent({
      actorId,
      action: ORDER_AUDIT_ACTIONS.ORDER_EXPIRED,
      targetType: AuditTargetType.ORDER,
      targetId: params.orderId,
      metadata: params.metadata,
    });
  }

  private async resolveSystemActorId(): Promise<string> {
    if (this.systemActorId) {
      return this.systemActorId;
    }

    const user = await this.prisma.user.findFirst({
      where: { email: SYSTEM_AUDIT_ACTOR_EMAIL },
      select: { id: true },
    });

    if (!user) {
      throw new Error(
        `System audit actor not found (${SYSTEM_AUDIT_ACTOR_EMAIL})`,
      );
    }

    this.systemActorId = user.id;
    return user.id;
  }
}
