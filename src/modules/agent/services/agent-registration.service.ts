import { ConflictException, Injectable } from '@nestjs/common';
import { AgentStatus, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
import { MaintenanceAvailabilityService } from '../../maintenance-center/services/maintenance-availability.service';
import { NotificationService } from '../../notification/services/notification.service';
import { TokenService } from '../../auth/token.service';
import { BCRYPT_ROUNDS } from '../../auth/auth.constants';
import { AgentRegisterDto } from '../../auth/dto/agent-register.dto';
import { AgentAuditService } from './agent-audit.service';
import { AgentInviteService } from './agent-invite.service';

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AgentRegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentInviteService: AgentInviteService,
    private readonly agentAudit: AgentAuditService,
    private readonly tokenService: TokenService,
    private readonly notificationService: NotificationService,
    private readonly configService: ConfigService,
    private readonly maintenanceAvailability: MaintenanceAvailabilityService,
  ) {}

  async registerPublic(dto: AgentRegisterDto) {
    this.maintenanceAvailability.assertLoginAllowed(UserRole.AGENT);
    const email = dto.email.trim().toLowerCase();
    const phone = dto.phone.trim();

    const invite = await this.agentInviteService.requireInviteForMode(dto.inviteToken, email);

    const existing = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException('Email đã được đăng ký');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const usernameBase = email.split('@')[0]?.replace(/[^a-z0-9_]/gi, '_').slice(0, 24) || 'agent';
    let username = usernameBase;
    let suffix = 0;
    while (
      await this.prisma.user.findFirst({
        where: { username, deletedAt: null },
      })
    ) {
      suffix += 1;
      username = `${usernameBase.slice(0, 20)}_${suffix}`;
    }

    const user = await this.prisma.user.create({
      data: {
        username,
        fullName: email.split('@')[0] ?? 'Đại lý',
        email,
        phone,
        passwordHash,
        role: UserRole.AGENT,
        status: UserStatus.ACTIVE,
        acceptedTermsAt: new Date(),
      },
    });

    const agent = await this.prisma.agent.create({
      data: {
        userId: user.id,
        companyName: 'Chưa cập nhật',
        contactEmail: email,
        status: AgentStatus.PENDING_KYC,
        apiEnabled: false,
        securityConfig: {
          onboarding: {
            accountType: dto.accountType,
            registeredAt: new Date().toISOString(),
            source: 'public_web',
          },
        },
      },
    });

    if (invite) {
      await this.agentInviteService.consumeInvite(invite.id, user.id);
    }

    await this.agentAudit.recordRegistered(user.id, agent.id);

    const verifyToken = await this.createEmailVerificationToken(user.id);
    const verifyUrl = this.buildPartnerVerifyUrl(verifyToken);
    await this.notificationService.notifyAgentRegister(
      email,
      verifyUrl,
      user.fullName ?? undefined,
    );

    return {
      ok: true,
      requiresEmailVerification: true,
      email,
      message: 'Đăng ký thành công. Vui lòng kiểm tra email để xác minh tài khoản.',
      partnerLoginUrl: this.buildPartnerLoginUrl(),
    };
  }

  private buildPartnerVerifyUrl(token: string): string {
    const base =
      this.configService.get<string>('partnerPublicUrl') ??
      process.env.PARTNER_PUBLIC_URL ??
      'http://partner.localhost';
    return `${base.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(token)}`;
  }

  private buildPartnerLoginUrl(): string {
    const base =
      this.configService.get<string>('partnerPublicUrl') ??
      process.env.PARTNER_PUBLIC_URL ??
      'http://partner.localhost';
    return `${base.replace(/\/$/, '')}/login`;
  }

  private async createEmailVerificationToken(userId: string): Promise<string> {
    const rawToken = this.tokenService.generateRefreshTokenValue();
    const tokenHash = this.tokenService.hashToken(rawToken);

    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
      },
    });

    return rawToken;
  }
}
