import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AgentMemberRole, AgentMemberStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { AgentRepository } from '../../agent/repositories/agent.repository';
import {
  AGENT_ROLE_PERMISSIONS,
  AgentPlatformPermission,
  AgentPlatformRole,
  roleHasPermission,
} from '../../agent-platform/entities/agent-platform.constants';

export interface AgentMemberContext {
  userId: string;
  agentId: string;
  memberId: string | null;
  platformRole: AgentPlatformRole;
  permissions: AgentPlatformPermission[];
  isPrimaryOwner: boolean;
  impersonation?: {
    sessionId: string;
    adminUserId: string;
    readOnly: boolean;
  };
}

interface CacheEntry {
  ctx: AgentMemberContext;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;

@Injectable()
export class AgentMemberContextService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentRepository: AgentRepository,
  ) {}

  invalidate(userId: string) {
    this.cache.delete(userId);
  }

  async resolve(
    userId: string,
    impersonation?: AgentMemberContext['impersonation'],
  ): Promise<AgentMemberContext> {
    const cacheKey = impersonation ? `${userId}:imp:${impersonation.sessionId}` : userId;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.ctx;
    }

    const member = await this.prisma.agentMember.findUnique({
      where: { userId },
      include: { agent: true },
    });

    if (member && member.agent.deletedAt) {
      throw new NotFoundException('Agent profile not found');
    }

    if (member) {
      if (member.status === AgentMemberStatus.LOCKED || member.status === AgentMemberStatus.INACTIVE) {
        throw new ForbiddenException('Tài khoản thành viên đã bị khóa');
      }
      const platformRole = member.role as AgentPlatformRole;
      const ctx: AgentMemberContext = {
        userId,
        agentId: member.agentId,
        memberId: member.id,
        platformRole,
        permissions: [...AGENT_ROLE_PERMISSIONS[platformRole]],
        isPrimaryOwner: platformRole === 'OWNER',
        impersonation,
      };
      this.cache.set(cacheKey, { ctx, expiresAt: Date.now() + CACHE_TTL_MS });
      return ctx;
    }

    const agent = await this.agentRepository.findByUserId(userId);
    if (!agent) {
      throw new NotFoundException('Agent profile not found');
    }

    await this.ensureOwnerMember(agent.id, userId);

    const ctx: AgentMemberContext = {
      userId,
      agentId: agent.id,
      memberId: null,
      platformRole: 'OWNER',
      permissions: [...AGENT_ROLE_PERMISSIONS.OWNER],
      isPrimaryOwner: true,
      impersonation,
    };
    this.cache.set(cacheKey, { ctx, expiresAt: Date.now() + CACHE_TTL_MS });
    return ctx;
  }

  assertPermission(ctx: AgentMemberContext, permission: AgentPlatformPermission) {
    if (ctx.impersonation?.readOnly && this.isBlockedWhileImpersonating(permission)) {
      throw new ForbiddenException('Không được phép khi đang impersonate (read-only)');
    }
    if (!roleHasPermission(ctx.platformRole, permission)) {
      throw new ForbiddenException('Không có quyền truy cập');
    }
  }

  private isBlockedWhileImpersonating(permission: AgentPlatformPermission): boolean {
    return (
      permission.endsWith('.manage') ||
      permission.endsWith('.export') ||
      permission === 'retry.manage' ||
      permission === 'api.manage'
    );
  }

  private async ensureOwnerMember(agentId: string, userId: string) {
    const existing = await this.prisma.agentMember.findUnique({ where: { userId } });
    if (existing) return;
    await this.prisma.agentMember.create({
      data: {
        agentId,
        userId,
        role: AgentMemberRole.OWNER,
        status: AgentMemberStatus.ACTIVE,
      },
    });
  }
}
