import { Injectable } from '@nestjs/common';
import { AuditTargetType } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../auth/audit.service';
import {
  PAYMENT_AUDIT_ACTIONS,
  SYSTEM_AUDIT_ACTOR_EMAIL,
} from '../entities/payment.constants';

@Injectable()
export class PaymentAuditService {
  private systemActorId?: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async recordPaymentCreated(params: {
    orderId: string;
    paymentId: string;
    actorUserId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const actorId =
      params.actorUserId ?? (await this.resolveSystemActorId());

    await this.auditService.recordEvent({
      actorId,
      action: PAYMENT_AUDIT_ACTIONS.PAYMENT_CREATED,
      targetType: AuditTargetType.ORDER,
      targetId: params.orderId,
      metadata: { paymentId: params.paymentId, ...params.metadata },
    });
  }

  async recordPaymentSuccess(params: {
    orderId: string;
    paymentId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const actorId = await this.resolveSystemActorId();
    await this.auditService.recordEvent({
      actorId,
      action: PAYMENT_AUDIT_ACTIONS.PAYMENT_SUCCESS,
      targetType: AuditTargetType.ORDER,
      targetId: params.orderId,
      metadata: { paymentId: params.paymentId, ...params.metadata },
    });
  }

  async recordPaymentFailed(params: {
    orderId: string;
    paymentId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const actorId = await this.resolveSystemActorId();
    await this.auditService.recordEvent({
      actorId,
      action: PAYMENT_AUDIT_ACTIONS.PAYMENT_FAILED,
      targetType: AuditTargetType.ORDER,
      targetId: params.orderId,
      metadata: { paymentId: params.paymentId, ...params.metadata },
    });
  }

  async recordDuplicateWebhook(params: {
    orderId: string;
    paymentId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const actorId = await this.resolveSystemActorId();
    await this.auditService.recordEvent({
      actorId,
      action: PAYMENT_AUDIT_ACTIONS.PAYMENT_DUPLICATE_WEBHOOK,
      targetType: AuditTargetType.ORDER,
      targetId: params.orderId,
      metadata: { paymentId: params.paymentId, ...params.metadata },
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
