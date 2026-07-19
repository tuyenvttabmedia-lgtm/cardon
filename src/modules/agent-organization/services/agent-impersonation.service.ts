import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import {
  SystemActivityEventCategory,
  SystemActivityEventType,
  SystemActivitySeverity,
  SystemActivitySource,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { ActivityEventDispatcher } from '../../activity-event/activity-event-dispatcher.service';
import { AuditService } from '../../auth/audit.service';
import { AUDIT_ACTIONS } from '../../auth/auth.constants';
import { TokenService } from '../../auth/token.service';
import { AuthService } from '../../auth/auth.service';
import { AgentMemberContextService } from './agent-member-context.service';

@Injectable()
export class AgentImpersonationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly memberContext: AgentMemberContextService,
    private readonly activityDispatcher: ActivityEventDispatcher,
    private readonly auditService: AuditService,
  ) {}

  async startImpersonation(
    adminUserId: string,
    agentId: string,
    targetUserId?: string,
    ipAddress?: string,
  ) {
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, deletedAt: null },
    });
    if (!agent) throw new NotFoundException('Agent not found');

    const targetId = targetUserId ?? agent.userId;
    const targetUser = await this.prisma.user.findFirst({
      where: { id: targetId, deletedAt: null, role: UserRole.AGENT },
    });
    if (!targetUser) throw new NotFoundException('Target user not found');

    const session = await this.prisma.agentImpersonationSession.create({
      data: {
        adminUserId,
        targetUserId: targetId,
        agentId,
        readOnly: true,
        ipAddress: ipAddress ?? null,
      },
    });

    const { token, expiresIn } = this.tokenService.generateAccessToken({
      sub: targetUser.id,
      email: targetUser.email,
      role: targetUser.role,
      impersonatedBy: adminUserId,
      impersonationSessionId: session.id,
      impersonationReadOnly: true,
    });

    this.activityDispatcher.dispatch({
      eventType: SystemActivityEventType.API_KEY_CREATED,
      eventCategory: SystemActivityEventCategory.AUTH,
      severity: SystemActivitySeverity.WARNING,
      source: SystemActivitySource.ADMIN,
      resource: 'impersonation',
      title: 'impersonation_start',
      description: `Admin impersonating agent user ${targetUser.email}`,
      performedBy: adminUserId,
      metadata: { agentId, targetUserId: targetId, sessionId: session.id },
    });

    void this.auditService.recordSecurityEvent({
      userId: adminUserId,
      action: AUDIT_ACTIONS.IMPERSONATION_START,
      ipAddress,
      metadata: { agentId, targetUserId: targetId, sessionId: session.id },
    });

    const memberCtx = await this.memberContext.resolve(targetId, {
      sessionId: session.id,
      adminUserId,
      readOnly: true,
    });

    return {
      accessToken: token,
      expiresIn,
      sessionId: session.id,
      targetUser: { id: targetUser.id, email: targetUser.email },
      companyName: agent.companyName,
      platformRole: memberCtx.platformRole,
      readOnly: true,
      partnerUrl: 'http://partner.localhost',
    };
  }

  async stopImpersonation(sessionId: string, adminUserId: string) {
    const session = await this.prisma.agentImpersonationSession.findFirst({
      where: { id: sessionId, adminUserId, endedAt: null },
    });
    if (!session) throw new NotFoundException('Impersonation session not found');

    await this.prisma.agentImpersonationSession.update({
      where: { id: sessionId },
      data: { endedAt: new Date() },
    });

    void this.auditService.recordSecurityEvent({
      userId: adminUserId,
      action: AUDIT_ACTIONS.IMPERSONATION_STOP,
      metadata: { sessionId },
    });

    return { ok: true };
  }

  async listAgentMembersForAdmin(agentId: string) {
    const members = await this.prisma.agentMember.findMany({
      where: { agentId },
      include: { user: { select: { id: true, email: true, fullName: true, lastLoginAt: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return {
      items: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        email: m.user.email,
        name: m.displayName ?? m.user.fullName,
        role: m.role,
        status: m.status,
        lastLoginAt: m.lastLoginAt?.toISOString() ?? m.user.lastLoginAt?.toISOString() ?? null,
      })),
    };
  }
}
