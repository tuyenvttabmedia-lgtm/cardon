import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AgentImpersonationService } from '../services/agent-impersonation.service';
import { AgentOrganizationService } from '../services/agent-organization.service';
import { AgentMemberContextService } from '../services/agent-member-context.service';
import { PrismaService } from '../../../database/prisma.service';

@Controller('admin/agents')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminAgentOrganizationController {
  constructor(
    private readonly impersonation: AgentImpersonationService,
    private readonly orgService: AgentOrganizationService,
    private readonly memberContext: AgentMemberContextService,
    private readonly prisma: PrismaService,
  ) {}

  @Get(':agentId/organization/users')
  @Permissions('users.read')
  listUsers(@Param('agentId', ParseUUIDPipe) agentId: string) {
    return this.impersonation.listAgentMembersForAdmin(agentId);
  }

  @Get(':agentId/organization/login-history')
  @Permissions('users.read')
  async loginHistory(@Param('agentId', ParseUUIDPipe) agentId: string) {
    const members = await this.prisma.agentMember.findMany({
      where: { agentId },
      select: { userId: true },
    });
    const userIds = members.map((m) => m.userId);
    const rows = await this.prisma.agentLoginHistory.findMany({
      where: { userId: { in: userIds } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { items: rows };
  }

  @Post(':agentId/impersonate')
  @Permissions('agents.manage')
  impersonate(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Body() body: { targetUserId?: string },
    @Req() req: Request,
  ) {
    return this.impersonation.startImpersonation(
      admin.id,
      agentId,
      body.targetUserId,
      req.ip,
    );
  }

  @Post('impersonation/:sessionId/stop')
  @Permissions('agents.manage')
  stopImpersonation(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.impersonation.stopImpersonation(sessionId, admin.id);
  }
}
