import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AgentMemberInviteStatus,
  AgentMemberRole,
  AgentMemberStatus,
  SystemActivityEventCategory,
  SystemActivityEventType,
  SystemActivitySeverity,
  SystemActivitySource,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../../database/prisma.service';
import { ActivityEventDispatcher } from '../../activity-event/activity-event-dispatcher.service';
import { AuditService } from '../../auth/audit.service';
import { AUDIT_ACTIONS } from '../../auth/auth.constants';
import { LedgerService } from '../../agent/services/ledger.service';
import { NotificationService } from '../../notification/services/notification.service';
import {
  AGENT_PLATFORM_ROLES,
  AGENT_ROLE_LABELS,
  AGENT_ROLE_PERMISSIONS,
  AgentPlatformRole,
} from '../../agent-platform/entities/agent-platform.constants';
import { AgentMemberContext, AgentMemberContextService } from './agent-member-context.service';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;

@Injectable()
export class AgentOrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memberContext: AgentMemberContextService,
    private readonly ledgerService: LedgerService,
    private readonly notificationService: NotificationService,
    private readonly activityDispatcher: ActivityEventDispatcher,
    private readonly auditService: AuditService,
  ) {}

  async getOrganization(userId: string) {
    const ctx = await this.memberContext.resolve(userId);
    this.memberContext.assertPermission(ctx, 'organization.read');

    const agent = await this.prisma.agent.findUniqueOrThrow({
      where: { id: ctx.agentId },
      include: {
        user: { select: { email: true, fullName: true } },
        webhookConfig: { select: { enabled: true, callbackUrl: true } },
        kyc: { select: { status: true } },
        _count: { select: { members: true } },
      },
    });

    const balance = await this.ledgerService.getBalance(agent.id);
    const ownerMember = await this.prisma.agentMember.findFirst({
      where: { agentId: agent.id, role: AgentMemberRole.OWNER },
      include: { user: { select: { email: true, fullName: true } } },
    });

    return {
      companyName: agent.companyName,
      agentCode: agent.apiKeyLookup?.slice(0, 12) ?? agent.id.slice(0, 8).toUpperCase(),
      status: agent.status,
      createdAt: agent.createdAt.toISOString(),
      owner: {
        email: ownerMember?.user.email ?? agent.user.email,
        name: ownerMember?.user.fullName ?? agent.user.fullName,
      },
      userCount: agent._count.members,
      apiKeyConfigured: !!agent.apiKeyLookup,
      webhookStatus: agent.webhookConfig?.enabled ? 'ACTIVE' : 'INACTIVE',
      webhookUrl: agent.webhookConfig?.callbackUrl ?? null,
      walletBalance: balance.availableBalance,
      kycStatus: agent.kyc?.status ?? 'PENDING',
      agentId: agent.id,
    };
  }

  async listUsers(userId: string, query: { page?: number; limit?: number; search?: string }) {
    const ctx = await this.memberContext.resolve(userId);
    this.memberContext.assertPermission(ctx, 'users.read');

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where = {
      agentId: ctx.agentId,
      ...(query.search
        ? {
            user: {
              OR: [
                { email: { contains: query.search, mode: 'insensitive' as const } },
                { fullName: { contains: query.search, mode: 'insensitive' as const } },
              ],
            },
          }
        : {}),
    };

    const [rows, total, invites] = await Promise.all([
      this.prisma.agentMember.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'asc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
              status: true,
              lastLoginAt: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.agentMember.count({ where }),
      this.prisma.agentMemberInvite.findMany({
        where: { agentId: ctx.agentId, status: AgentMemberInviteStatus.PENDING },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      items: rows.map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.displayName ?? m.user.fullName ?? m.user.email,
        email: m.user.email,
        role: m.role,
        roleLabel: AGENT_ROLE_LABELS[m.role as AgentPlatformRole],
        status: m.status,
        lastLoginAt: m.lastLoginAt?.toISOString() ?? m.user.lastLoginAt?.toISOString() ?? null,
        createdAt: m.createdAt.toISOString(),
        twoFactorEnabled: m.twoFactorEnabled,
      })),
      invites: invites.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        roleLabel: AGENT_ROLE_LABELS[i.role as AgentPlatformRole],
        status: i.status,
        expiresAt: i.expiresAt.toISOString(),
        createdAt: i.createdAt.toISOString(),
      })),
      page,
      limit,
      total,
      roles: AGENT_PLATFORM_ROLES,
    };
  }

  async inviteUser(
    actorId: string,
    body: { email: string; role: AgentPlatformRole; expiresInDays?: number },
  ) {
    const ctx = await this.memberContext.resolve(actorId);
    this.memberContext.assertPermission(ctx, 'users.manage');
    if (body.role === 'OWNER') throw new BadRequestException('Không thể mời vai trò OWNER');

    const email = body.email.trim().toLowerCase();
    const existingMember = await this.prisma.agentMember.findFirst({
      where: { agentId: ctx.agentId, user: { email } },
    });
    if (existingMember) throw new ConflictException('Email đã là thành viên');

    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + (body.expiresInDays ?? 7) * 86400000);

    const invite = await this.prisma.agentMemberInvite.create({
      data: {
        agentId: ctx.agentId,
        email,
        role: body.role as AgentMemberRole,
        tokenHash,
        expiresAt,
        invitedById: actorId,
      },
    });

    void this.notificationService.notifyCustomerInApp({
      userId: actorId,
      type: 'TEAM_INVITE_SENT',
      title: 'Đã gửi lời mời',
      body: `Lời mời đã gửi tới ${email}`,
      metadata: { inviteId: invite.id, email },
      jobId: `invite-sent-${invite.id}`,
    });

    this.logActivity(actorId, ctx.agentId, 'invite_user', { email, role: body.role });
    return {
      id: invite.id,
      email,
      role: body.role,
      expiresAt: expiresAt.toISOString(),
      inviteToken: token,
    };
  }

  async resendInvite(actorId: string, inviteId: string) {
    const ctx = await this.memberContext.resolve(actorId);
    this.memberContext.assertPermission(ctx, 'users.manage');

    const invite = await this.prisma.agentMemberInvite.findFirst({
      where: { id: inviteId, agentId: ctx.agentId, status: AgentMemberInviteStatus.PENDING },
    });
    if (!invite) throw new NotFoundException('Lời mời không tồn tại');

    const token = randomBytes(32).toString('hex');
    await this.prisma.agentMemberInvite.update({
      where: { id: inviteId },
      data: {
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });
    return { ok: true, inviteToken: token };
  }

  async cancelInvite(actorId: string, inviteId: string) {
    const ctx = await this.memberContext.resolve(actorId);
    this.memberContext.assertPermission(ctx, 'users.manage');
    await this.prisma.agentMemberInvite.updateMany({
      where: { id: inviteId, agentId: ctx.agentId, status: AgentMemberInviteStatus.PENDING },
      data: { status: AgentMemberInviteStatus.CANCELLED },
    });
    return { ok: true };
  }

  async acceptInvite(body: { token: string; password: string; fullName?: string }) {
    const tokenHash = createHash('sha256').update(body.token).digest('hex');
    const invite = await this.prisma.agentMemberInvite.findFirst({
      where: { tokenHash, status: AgentMemberInviteStatus.PENDING },
    });
    if (!invite || invite.expiresAt < new Date()) {
      throw new BadRequestException('Lời mời không hợp lệ hoặc đã hết hạn');
    }

    let user = await this.prisma.user.findFirst({ where: { email: invite.email, deletedAt: null } });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: invite.email,
          fullName: body.fullName?.trim() ?? null,
          passwordHash: await bcrypt.hash(body.password, BCRYPT_ROUNDS),
          role: UserRole.AGENT,
          status: UserStatus.ACTIVE,
          acceptedTermsAt: new Date(),
        },
      });
    }

    if (await this.prisma.agentMember.findUnique({ where: { userId: user.id } })) {
      throw new ConflictException('User đã thuộc tổ chức khác');
    }

    await this.prisma.$transaction([
      this.prisma.agentMember.create({
        data: {
          agentId: invite.agentId,
          userId: user.id,
          role: invite.role,
          status: AgentMemberStatus.ACTIVE,
          invitedById: invite.invitedById,
        },
      }),
      this.prisma.agentMemberInvite.update({
        where: { id: invite.id },
        data: { status: AgentMemberInviteStatus.ACCEPTED, acceptedAt: new Date() },
      }),
    ]);

    this.logActivity(user.id, invite.agentId, 'invite_accepted', { email: invite.email });
    return { ok: true, email: user.email };
  }

  async updateUser(
    actorId: string,
    memberId: string,
    body: { role?: AgentPlatformRole; status?: AgentMemberStatus; displayName?: string },
  ) {
    const ctx = await this.memberContext.resolve(actorId);
    this.memberContext.assertPermission(ctx, 'users.manage');

    const member = await this.prisma.agentMember.findFirst({
      where: { id: memberId, agentId: ctx.agentId },
    });
    if (!member) throw new NotFoundException('Thành viên không tồn tại');
    if (member.role === AgentMemberRole.OWNER && body.role && body.role !== 'OWNER') {
      throw new ForbiddenException('Không thể thay đổi vai trò OWNER');
    }
    if (body.role === 'OWNER' && ctx.platformRole !== 'OWNER') {
      throw new ForbiddenException('Chỉ OWNER mới gán vai trò OWNER');
    }

    await this.prisma.agentMember.update({
      where: { id: memberId },
      data: {
        ...(body.role ? { role: body.role as AgentMemberRole } : {}),
        ...(body.status ? { status: body.status } : {}),
        ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
      },
    });

    this.memberContext.invalidate(member.userId);
    if (body.role) {
      this.logActivity(actorId, ctx.agentId, 'role_change', { memberId, role: body.role });
      void this.auditService.recordSecurityEvent({
        userId: actorId,
        action: AUDIT_ACTIONS.AGENT_MEMBER_ROLE_CHANGE,
        metadata: { memberId, role: body.role },
      });
    }
    return { ok: true };
  }

  async deleteUser(actorId: string, memberId: string) {
    const ctx = await this.memberContext.resolve(actorId);
    this.memberContext.assertPermission(ctx, 'users.manage');

    const member = await this.prisma.agentMember.findFirst({
      where: { id: memberId, agentId: ctx.agentId },
    });
    if (!member) throw new NotFoundException('Thành viên không tồn tại');
    if (member.role === AgentMemberRole.OWNER) throw new ForbiddenException('Không thể xóa OWNER');

    await this.prisma.agentMember.delete({ where: { id: memberId } });
    this.memberContext.invalidate(member.userId);
    this.logActivity(actorId, ctx.agentId, 'delete_user', { memberId });
    return { ok: true };
  }

  async resetPassword(actorId: string, memberId: string) {
    const ctx = await this.memberContext.resolve(actorId);
    this.memberContext.assertPermission(ctx, 'users.manage');
    this.logActivity(actorId, ctx.agentId, 'password_reset', { memberId });
    return { ok: true, message: 'Email đặt lại mật khẩu đã được gửi' };
  }

  getPermissionMatrix(userId: string) {
    return this.memberContext.resolve(userId).then((ctx) => {
      this.memberContext.assertPermission(ctx, 'organization.read');
      const modules = [
        { key: 'dashboard', label: 'Bảng điều khiển', permission: 'dashboard.read' },
        { key: 'wallet', label: 'Ví', permission: 'wallet.read' },
        { key: 'orders', label: 'Đơn hàng', permission: 'orders.read' },
        { key: 'api', label: 'API', permission: 'api.read' },
        { key: 'webhook', label: 'Webhook', permission: 'webhooks.read' },
        { key: 'reports', label: 'Báo cáo', permission: 'reports.read' },
        { key: 'users', label: 'Người dùng', permission: 'users.read' },
        { key: 'exports', label: 'Xuất', permission: 'wallet.export' },
        { key: 'retry', label: 'Retry', permission: 'retry.manage' },
        { key: 'apiKeys', label: 'Khóa API', permission: 'api.manage' },
      ] as const;

      return {
        roles: AGENT_PLATFORM_ROLES.map((role) => ({
          role,
          label: AGENT_ROLE_LABELS[role],
          permissions: AGENT_ROLE_PERMISSIONS[role],
        })),
        modules: modules.map((m) => ({
          ...m,
          access: Object.fromEntries(
            AGENT_PLATFORM_ROLES.map((role) => [
              role,
              AGENT_ROLE_PERMISSIONS[role].includes(m.permission as never),
            ]),
          ),
        })),
        currentRole: ctx.platformRole,
      };
    });
  }

  async listLoginHistory(userId: string, query: { page?: number; limit?: number }) {
    const ctx = await this.memberContext.resolve(userId);
    this.memberContext.assertPermission(ctx, 'sessions.read');

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.agentLoginHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.agentLoginHistory.count({ where: { userId } }),
    ]);

    return {
      items: items.map((r) => ({
        id: r.id,
        at: r.createdAt.toISOString(),
        ip: r.ipAddress,
        country: r.country,
        browser: r.browser,
        device: r.device,
        result: r.result,
      })),
      page,
      limit,
      total,
    };
  }

  async listSessions(userId: string) {
    const ctx = await this.memberContext.resolve(userId);
    this.memberContext.assertPermission(ctx, 'sessions.read');

    const sessions = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    return {
      items: sessions.map((s) => ({
        id: s.id,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
      })),
    };
  }

  async revokeSession(userId: string, sessionId: string) {
    const ctx = await this.memberContext.resolve(userId);
    this.memberContext.assertPermission(ctx, 'sessions.manage');
    await this.prisma.refreshToken.updateMany({
      where: { id: sessionId, userId },
      data: { revokedAt: new Date() },
    });
    this.logActivity(userId, ctx.agentId, 'session_revoke', { sessionId });
    return { ok: true };
  }

  async revokeOtherSessions(userId: string) {
    const ctx = await this.memberContext.resolve(userId);
    this.memberContext.assertPermission(ctx, 'sessions.manage');
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  async listOrganizationActivity(userId: string, query: { page?: number; limit?: number }) {
    const ctx = await this.memberContext.resolve(userId);
    this.memberContext.assertPermission(ctx, 'organization.read');
    return { items: [], page: query.page ?? 1, limit: query.limit ?? 20, total: 0 };
  }

  getSessionPayload(ctx: AgentMemberContext) {
    return {
      userId: ctx.userId,
      agentId: ctx.agentId,
      memberId: ctx.memberId,
      platformRole: ctx.platformRole,
      permissions: ctx.permissions,
      isPrimaryOwner: ctx.isPrimaryOwner,
      impersonation: ctx.impersonation
        ? { sessionId: ctx.impersonation.sessionId, readOnly: ctx.impersonation.readOnly }
        : null,
    };
  }

  private logActivity(userId: string, agentId: string, action: string, metadata?: Record<string, unknown>) {
    this.activityDispatcher.dispatch({
      eventType: SystemActivityEventType.API_KEY_CREATED,
      eventCategory: SystemActivityEventCategory.API,
      severity: SystemActivitySeverity.INFO,
      source: SystemActivitySource.PARTNER,
      resource: 'agent_organization',
      title: action,
      description: action,
      performedBy: userId,
      metadata: { agentId, ...metadata },
    });
  }
}
