import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';import { AgentRegistrationMode } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../../database/prisma.service';
import { SettingsStoreService } from '../../settings/services/settings-store.service';

@Injectable()
export class AgentInviteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsStore: SettingsStoreService,
  ) {}

  getRegistrationMode(): AgentRegistrationMode {
    const system = this.settingsStore.resolveSystemConfig();
    return (
      (system.agentRegistrationMode as AgentRegistrationMode) ??
      AgentRegistrationMode.PUBLIC_APPROVAL
    );
  }

  async validateInviteToken(rawToken: string, userEmail?: string) {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const invite = await this.prisma.agentInvite.findFirst({
      where: {
        tokenHash,
        deletedAt: null,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!invite) {
      throw new ForbiddenException('Invalid or expired invite');
    }

    if (invite.email && userEmail && invite.email !== userEmail.toLowerCase()) {
      throw new ForbiddenException('Invite email mismatch');
    }

    return invite;
  }

  async consumeInvite(inviteId: string, userId: string) {
    await this.prisma.agentInvite.update({
      where: { id: inviteId },
      data: { usedAt: new Date(), usedByUserId: userId },
    });
  }

  assertRegistrationAllowed(mode?: AgentRegistrationMode) {
    const registrationMode = mode ?? this.getRegistrationMode();
    if (registrationMode === AgentRegistrationMode.DISABLED) {
      throw new ForbiddenException('Agent registration is disabled');
    }
  }

  async requireInviteForMode(inviteToken?: string, userEmail?: string) {
    const mode = this.getRegistrationMode();
    this.assertRegistrationAllowed(mode);

    if (mode === AgentRegistrationMode.INVITE_ONLY) {
      if (!inviteToken) {
        throw new BadRequestException('Invite token is required');
      }
      return this.validateInviteToken(inviteToken, userEmail);
    }

    if (inviteToken?.trim()) {
      return this.validateInviteToken(inviteToken, userEmail);
    }

    return null;
  }
}
