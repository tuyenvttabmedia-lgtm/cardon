import { Injectable } from '@nestjs/common';
import { AuditTargetType } from '@prisma/client';
import { AuditService } from '../../auth/audit.service';
import { AGENT_AUDIT_ACTIONS } from '../entities/agent.constants';

@Injectable()
export class AgentAuditService {
  constructor(private readonly auditService: AuditService) {}

  recordRegistered(actorId: string, agentId: string) {
    return this.record(actorId, AGENT_AUDIT_ACTIONS.AGENT_REGISTERED, agentId);
  }

  recordKycSubmitted(actorId: string, agentId: string) {
    return this.record(actorId, AGENT_AUDIT_ACTIONS.KYC_SUBMITTED, agentId);
  }

  recordKycApproved(actorId: string, agentId: string) {
    return this.record(actorId, AGENT_AUDIT_ACTIONS.KYC_APPROVED, agentId);
  }

  recordKycRejected(actorId: string, agentId: string, reason?: string) {
    return this.record(actorId, AGENT_AUDIT_ACTIONS.KYC_REJECTED, agentId, {
      reason,
    });
  }

  recordKycNeedMoreInfo(actorId: string, agentId: string, reason?: string, fields?: string[]) {
    return this.record(actorId, AGENT_AUDIT_ACTIONS.KYC_NEED_MORE_INFO, agentId, {
      reason,
      fields,
    });
  }

  recordCredited(
    actorId: string,
    agentId: string,
    metadata: { amount: string; referenceId: string },
  ) {
    return this.record(actorId, AGENT_AUDIT_ACTIONS.AGENT_CREDITED, agentId, metadata);
  }

  recordSuspended(actorId: string, agentId: string, reason?: string) {
    return this.record(actorId, AGENT_AUDIT_ACTIONS.AGENT_SUSPENDED, agentId, {
      reason,
    });
  }

  recordApiKeyGenerated(actorId: string, agentId: string) {
    return this.record(
      actorId,
      AGENT_AUDIT_ACTIONS.AGENT_API_KEY_GENERATED,
      agentId,
    );
  }

  private record(
    actorId: string,
    action: string,
    agentId: string,
    metadata?: Record<string, unknown>,
  ) {
    return this.auditService.recordEvent({
      actorId,
      action,
      targetType: AuditTargetType.AGENT,
      targetId: agentId,
      metadata,
    });
  }
}
