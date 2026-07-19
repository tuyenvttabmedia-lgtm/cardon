import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import {
  SystemActivityEventCategory,
  SystemActivityEventType,
  SystemActivitySeverity,
  SystemActivitySource,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { ErrorCode } from '../../common/constants/error-codes.constants';
import { AppHttpException } from '../../common/exceptions/app-http.exception';
import { PrismaService } from '../../database/prisma.service';
import { NotificationService } from '../notification/services/notification.service';
import { SettingsEncryptionService } from '../settings/services/settings-encryption.service';
import { AUDIT_ACTIONS, BCRYPT_ROUNDS } from './auth.constants';
import { AuditService } from './audit.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import {
  AgentRegisterDto,
  ResendVerificationDto,
  VerifyEmailDto,
} from './dto/agent-register.dto';
import { AuthResult, AuthUserSummary } from './interfaces/auth-result.interface';
import { TokenService } from './token.service';
import { MaintenanceAvailabilityService } from '../maintenance-center/services/maintenance-availability.service';
import { ActivityEventDispatcher } from '../activity-event/activity-event-dispatcher.service';
import {
  ActivityRequestContext,
  isStaffRole,
} from '../activity-event/interfaces/activity-event.interface';

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
    private readonly settingsEncryption: SettingsEncryptionService,
    private readonly activityDispatcher: ActivityEventDispatcher,
    private readonly maintenanceAvailability: MaintenanceAvailabilityService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    this.maintenanceAvailability.assertLoginAllowed(UserRole.CUSTOMER);
    const email = dto.email.trim().toLowerCase();
    const username = dto.username.trim().toLowerCase();
    const phone = dto.phone.trim();

    const [existingEmail, existingUsername] = await Promise.all([
      this.prisma.user.findFirst({
        where: { email, deletedAt: null },
      }),
      this.prisma.user.findFirst({
        where: { username, deletedAt: null },
      }),
    ]);

    if (existingEmail) {
      throw new ConflictException('Email already registered');
    }

    if (existingUsername) {
      throw new ConflictException('Username already taken');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const acceptedTermsAt = new Date();
    const identityNumberEnc = dto.identityNumber
      ? this.settingsEncryption.encrypt(dto.identityNumber.trim())
      : undefined;

    const user = await this.prisma.user.create({
      data: {
        username,
        fullName: dto.fullName.trim(),
        email,
        phone,
        identityNumberEnc,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        acceptedTermsAt,
      },
    });

    const verifyToken = await this.createEmailVerificationToken(user.id);
    await this.notificationService.notifyUserRegister(
      email,
      verifyToken,
      dto.fullName.trim(),
    );

    return this.issueAuthResult(user, undefined);
  }

  async login(dto: LoginDto, context?: ActivityRequestContext): Promise<AuthResult> {
    const ipAddress = context?.ipAddress;
    const identifier = dto.identifier.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [{ email: identifier }, { username: identifier }],
      },
    });

    if (!user) {
      this.dispatchLoginFailed(null, null, 'UNKNOWN_USER', context);
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status === UserStatus.SUSPENDED) {
      await this.auditService.recordSecurityEvent({
        userId: user.id,
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        ipAddress,
        metadata: { reason: 'SUSPENDED' },
      });
      this.dispatchLoginFailed(user.id, user.email, 'SUSPENDED', context, user.role);
      throw new AppHttpException(
        ErrorCode.ACCOUNT_SUSPENDED,
        'Account is suspended',
        403,
      );
    }

    if (user.status === UserStatus.BANNED) {
      await this.auditService.recordSecurityEvent({
        userId: user.id,
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        ipAddress,
        metadata: { reason: 'BANNED' },
      });
      this.dispatchLoginFailed(user.id, user.email, 'BANNED', context, user.role);
      throw new AppHttpException(
        ErrorCode.ACCOUNT_SUSPENDED,
        'Account is banned',
        403,
      );
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      await this.auditService.recordSecurityEvent({
        userId: user.id,
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        ipAddress,
        metadata: { reason: 'INVALID_PASSWORD' },
      });
      this.dispatchLoginFailed(user.id, user.email, 'INVALID_PASSWORD', context, user.role);
      throw new UnauthorizedException('Invalid email or password');
    }

    this.maintenanceAvailability.assertLoginAllowed(user.role);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.auditService.recordSecurityEvent({
      userId: user.id,
      action: AUDIT_ACTIONS.LOGIN_SUCCESS,
      ipAddress,
    });

    if (isStaffRole(user.role)) {
      this.activityDispatcher.dispatch({
        eventType: SystemActivityEventType.LOGIN,
        eventCategory: SystemActivityEventCategory.AUTH,
        severity: SystemActivitySeverity.SUCCESS,
        source: SystemActivitySource.ADMIN,
        resource: 'auth',
        resourceDisplay: user.email,
        title: 'Admin Login',
        description: `${user.email} logged in`,
        performedBy: user.id,
        performedEmail: user.email,
        performedRole: user.role,
        ipAddress: ipAddress ?? null,
        userAgent: context?.userAgent ?? null,
        sessionId: context?.sessionId ?? null,
        correlationId: context?.correlationId ?? null,
      });
    }

    if (user.role === UserRole.AGENT) {
      void this.recordAgentPartnerLogin(user.id, 'SUCCESS', ipAddress, context?.userAgent);
    }

    return this.issueAuthResult(user, ipAddress);
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    const tokenHash = this.tokenService.hashToken(refreshToken);

    const stored = await this.prisma.refreshToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!stored || stored.user.deletedAt) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = stored.user;

    if (user.status !== UserStatus.ACTIVE) {
      throw new AppHttpException(
        ErrorCode.ACCOUNT_SUSPENDED,
        'Account is not active',
        403,
      );
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueAuthResult(user);
  }

  async logout(
    userId: string,
    refreshToken?: string,
    context?: ActivityRequestContext,
    userSnapshot?: { email: string; role: UserRole },
  ): Promise<{ message: string }> {
    const ipAddress = context?.ipAddress;
    if (refreshToken) {
      const tokenHash = this.tokenService.hashToken(refreshToken);
      const stored = await this.prisma.refreshToken.findFirst({
        where: {
          userId,
          tokenHash,
          revokedAt: null,
        },
      });

      if (stored) {
        await this.prisma.refreshToken.update({
          where: { id: stored.id },
          data: { revokedAt: new Date() },
        });
      }
    }

    await this.auditService.recordSecurityEvent({
      userId,
      action: AUDIT_ACTIONS.LOGOUT,
      ipAddress,
    });

    const role = userSnapshot?.role;
    if (role && isStaffRole(role)) {
      this.activityDispatcher.dispatch({
        eventType: SystemActivityEventType.LOGOUT,
        eventCategory: SystemActivityEventCategory.AUTH,
        severity: SystemActivitySeverity.INFO,
        source: SystemActivitySource.ADMIN,
        resource: 'auth',
        resourceDisplay: userSnapshot.email,
        title: 'Admin Logout',
        description: `${userSnapshot.email} logged out`,
        performedBy: userId,
        performedEmail: userSnapshot.email,
        performedRole: role,
        ipAddress: ipAddress ?? null,
        userAgent: context?.userAgent ?? null,
        sessionId: context?.sessionId ?? null,
        correlationId: context?.correlationId ?? null,
      });
    }

    return { message: 'Logged out successfully' };
  }

  private dispatchLoginFailed(
    userId: string | null,
    email: string | null,
    reason: string,
    context?: ActivityRequestContext,
    role?: UserRole,
  ): void {
    if (role && !isStaffRole(role)) {
      return;
    }

    this.activityDispatcher.dispatch({
      eventType: SystemActivityEventType.LOGIN_FAILED,
      eventCategory: SystemActivityEventCategory.AUTH,
      severity: SystemActivitySeverity.WARNING,
      source: SystemActivitySource.ADMIN,
      resource: 'auth',
      resourceDisplay: email ?? 'unknown',
      title: 'Login Failed',
      description: reason,
      performedBy: userId,
      performedEmail: email,
      performedRole: role ?? null,
      ipAddress: context?.ipAddress ?? null,
      userAgent: context?.userAgent ?? null,
      sessionId: context?.sessionId ?? null,
      correlationId: context?.correlationId ?? null,
      metadata: { reason },
    });
  }

  async forgotPassword(
    dto: ForgotPasswordDto,
    ipAddress?: string,
  ): Promise<{ message: string }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });

    if (user && user.status === UserStatus.ACTIVE) {
      const rawToken = this.tokenService.generateRefreshTokenValue();
      const tokenHash = this.tokenService.hashToken(rawToken);

      await this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
        },
      });

      await this.auditService.recordSecurityEvent({
        userId: user.id,
        action: AUDIT_ACTIONS.PASSWORD_RESET_REQUEST,
        ipAddress,
      });

      await this.notificationService.notifyPasswordReset(email, rawToken);
    }

    return {
      message:
        'If an account exists for this email, a password reset link has been sent',
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const tokenHash = this.tokenService.hashToken(dto.token);

    const resetToken = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!resetToken || resetToken.user.deletedAt) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { message: 'Password reset successfully' };
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<{ message: string; emailVerified: boolean }> {
    const tokenHash = this.tokenService.hashToken(dto.token.trim());

    const record = await this.prisma.emailVerificationToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!record || record.user.deletedAt) {
      throw new UnauthorizedException('Invalid or expired verification token');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      }),
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { message: 'Email verified successfully', emailVerified: true };
  }

  async resendVerification(dto: ResendVerificationDto): Promise<{ message: string }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });

    if (user && user.emailVerifiedAt === null && user.status === UserStatus.ACTIVE) {
      await this.prisma.emailVerificationToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      const verifyToken = await this.createEmailVerificationToken(user.id);
      const partnerBase = process.env.PARTNER_PUBLIC_URL ?? 'http://partner.localhost';
      const verifyUrl = `${partnerBase.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(verifyToken)}`;
      if (user.role === UserRole.AGENT) {
        await this.notificationService.notifyAgentRegister(email, verifyUrl, user.fullName ?? undefined);
      } else {
        await this.notificationService.notifyUserRegister(email, verifyToken, user.fullName ?? undefined);
      }
    }

    return {
      message: 'Nếu tài khoản tồn tại và chưa xác minh, email xác minh đã được gửi lại',
    };
  }

  async getMe(userId: string): Promise<AuthUserSummary & { permissions: string[] }> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      ...this.toUserSummary(user),
      permissions: [],
    };
  }

  private async issueAuthResult(
    user: {
      id: string;
      username?: string | null;
      fullName?: string | null;
      email: string;
      role: UserRole;
      emailVerifiedAt: Date | null;
      status: UserStatus;
    },
    _ipAddress?: string,
  ): Promise<AuthResult> {
    const payload = this.tokenService.buildJwtPayload(user);
    const { token: accessToken, expiresIn } =
      this.tokenService.generateAccessToken(payload);

    const refreshToken = this.tokenService.generateRefreshTokenValue();
    const tokenHash = this.tokenService.hashToken(refreshToken);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: this.tokenService.getRefreshTokenExpiryDate(),
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn,
      user: this.toUserSummary(user),
    };
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

  private toUserSummary(user: {
    id: string;
    username?: string | null;
    fullName?: string | null;
    email: string;
    role: UserRole;
    emailVerifiedAt: Date | null;
  }): AuthUserSummary {
    return {
      id: user.id,
      username: user.username ?? null,
      fullName: user.fullName ?? null,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerifiedAt !== null,
    };
  }

  private async recordAgentPartnerLogin(
    userId: string,
    result: 'SUCCESS' | 'FAILED',
    ipAddress?: string | null,
    userAgent?: string | null,
  ) {
    let agentId: string | null = null;
    const member = await this.prisma.agentMember.findUnique({ where: { userId } });
    if (member) {
      agentId = member.agentId;
      if (result === 'SUCCESS') {
        await this.prisma.agentMember.update({
          where: { id: member.id },
          data: { lastLoginAt: new Date() },
        });
      }
    } else {
      const agent = await this.prisma.agent.findFirst({ where: { userId, deletedAt: null } });
      agentId = agent?.id ?? null;
    }

    const ua = userAgent ?? '';
    await this.prisma.agentLoginHistory.create({
      data: {
        userId,
        agentId,
        ipAddress: ipAddress ?? null,
        userAgent: ua.slice(0, 512) || null,
        browser: ua.includes('Chrome') ? 'Chrome' : ua.includes('Firefox') ? 'Firefox' : 'Unknown',
        device: ua.includes('Mobile') ? 'Mobile' : 'Desktop',
        result,
      },
    });
  }
}
