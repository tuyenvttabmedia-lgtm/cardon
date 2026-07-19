import { Injectable } from '@nestjs/common';
import { AuditTargetType } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
import { SettingsStoreService } from '../../settings/services/settings-store.service';
import { AdminCreateAgentInviteDto } from '../dto/admin-operation.dto';
import { ADMIN_AUDIT_ACTIONS } from '../entities/admin.constants';
import { AdminAuditService } from './admin-audit.service';

@Injectable()
export class AdminAgentInviteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsStore: SettingsStoreService,
    private readonly configService: ConfigService,
    private readonly adminAudit: AdminAuditService,
  ) {}

  async createInvite(adminId: string, dto: AdminCreateAgentInviteDto) {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresInDays = dto.expiresInDays ?? 7;

    const invite = await this.prisma.agentInvite.create({
      data: {
        tokenHash,
        email: dto.email?.trim().toLowerCase(),
        createdById: adminId,
        expiresAt: new Date(Date.now() + expiresInDays * 86400000),
      },
    });

    const publicUrl =
      this.settingsStore.resolveSystemConfig().publicUrl ||
      this.configService.get<string>('appPublicUrl') ||
      'https://cardon.vn';

    await this.adminAudit.record(
      adminId,
      ADMIN_AUDIT_ACTIONS.ADMIN_AGENT_INVITE_CREATED,
      AuditTargetType.AGENT,
      invite.id,
      { email: dto.email ?? null },
    );

    return {
      inviteId: invite.id,
      inviteUrl: `${publicUrl.replace(/\/$/, '')}/partner/login?invite=${rawToken}`,
      expiresAt: invite.expiresAt.toISOString(),
    };
  }
}
