import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { AgentMemberContextService } from './agent-member-context.service';

@Injectable()
export class AgentLoginHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memberContext: AgentMemberContextService,
  ) {}

  async recordLogin(params: {
    userId: string;
    result: 'SUCCESS' | 'FAILED';
    ipAddress?: string | null;
    userAgent?: string | null;
  }) {
    const user = await this.prisma.user.findUnique({ where: { id: params.userId } });
    if (!user || user.role !== UserRole.AGENT) return;

    let agentId: string | null = null;
    try {
      const ctx = await this.memberContext.resolve(params.userId);
      agentId = ctx.agentId;
      await this.prisma.agentMember.updateMany({
        where: { userId: params.userId },
        data: { lastLoginAt: new Date() },
      });
    } catch {
      // user may not have agent yet
    }

    const ua = params.userAgent ?? '';
    await this.prisma.agentLoginHistory.create({
      data: {
        userId: params.userId,
        agentId,
        ipAddress: params.ipAddress ?? null,
        userAgent: ua.slice(0, 512) || null,
        browser: this.parseBrowser(ua),
        device: this.parseDevice(ua),
        result: params.result,
      },
    });
  }

  private parseBrowser(ua: string): string | null {
    if (!ua) return null;
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari')) return 'Safari';
    return 'Unknown';
  }

  private parseDevice(ua: string): string | null {
    if (!ua) return null;
    if (ua.includes('Mobile')) return 'Mobile';
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Mac')) return 'Mac';
    return 'Desktop';
  }
}
