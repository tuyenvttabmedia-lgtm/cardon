import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { ErrorCode } from '../../common/constants/error-codes.constants';
import { AuthService } from './auth.service';
import { AuditService } from './audit.service';
import { PermissionsGuard } from './guards/permissions.guard';
import { TokenService } from './token.service';

describe('AuthService', () => {
  let authService: AuthService;
  let prisma: {
    user: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    refreshToken: {
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    emailVerificationToken: { create: jest.Mock };
    passwordResetToken: {
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    auditLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let tokenService: {
    buildJwtPayload: jest.Mock;
    generateAccessToken: jest.Mock;
    generateRefreshTokenValue: jest.Mock;
    hashToken: jest.Mock;
    getRefreshTokenExpiryDate: jest.Mock;
  };
  let auditService: { recordSecurityEvent: jest.Mock };

  const activeUser = {
    id: 'user-1',
    username: 'testuser',
    fullName: 'Test User',
    email: 'test@cardon.vn',
    passwordHash: '',
    role: UserRole.CUSTOMER,
    status: UserStatus.ACTIVE,
    emailVerifiedAt: null,
    deletedAt: null,
  };

  beforeEach(async () => {
    activeUser.passwordHash = await bcrypt.hash('password123', 12);

    prisma = {
      user: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      refreshToken: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      emailVerificationToken: { create: jest.fn() },
      passwordResetToken: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn((ops) => Promise.all(ops)),
    };

    tokenService = {
      buildJwtPayload: jest.fn().mockReturnValue({
        sub: activeUser.id,
        email: activeUser.email,
        role: activeUser.role,
      }),
      generateAccessToken: jest.fn().mockReturnValue({
        token: 'access-token',
        expiresIn: 900,
      }),
      generateRefreshTokenValue: jest.fn().mockReturnValue('refresh-token-value'),
      hashToken: jest.fn().mockReturnValue('hashed-token'),
      getRefreshTokenExpiryDate: jest
        .fn()
        .mockReturnValue(new Date(Date.now() + 86400000)),
    };

    auditService = {
      recordSecurityEvent: jest.fn().mockResolvedValue(undefined),
    };

    authService = new AuthService(
      prisma as never,
      tokenService as unknown as TokenService,
      auditService as unknown as AuditService,
      { notifyUserRegister: jest.fn(), notifyPasswordReset: jest.fn() } as never,
      { encrypt: jest.fn(), decrypt: jest.fn() } as never,
      { dispatch: jest.fn() } as never,
    );
  });

  describe('register', () => {
    const registerDto = {
      username: 'testuser',
      fullName: 'Test User',
      email: 'test@cardon.vn',
      phone: '0912345678',
      password: 'password123',
      confirmPassword: 'password123',
      acceptTerms: true,
    };

    it('registers a new customer', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(activeUser);
      prisma.emailVerificationToken.create.mockResolvedValue({});
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await authService.register(registerDto);

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token-value');
      expect(result.user.role).toBe(UserRole.CUSTOMER);
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: UserRole.CUSTOMER,
            email: 'test@cardon.vn',
          }),
        }),
      );
    });

    it('rejects duplicate email', async () => {
      prisma.user.findFirst.mockResolvedValueOnce(activeUser);

      await expect(authService.register(registerDto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('login', () => {
    it('logs in with email identifier', async () => {
      prisma.user.findFirst.mockResolvedValue(activeUser);
      prisma.user.update.mockResolvedValue(activeUser);
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await authService.login({
        identifier: 'test@cardon.vn',
        password: 'password123',
      });

      expect(result.accessToken).toBe('access-token');
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          OR: [
            { email: 'test@cardon.vn' },
            { username: 'test@cardon.vn' },
          ],
        },
      });
      expect(auditService.recordSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LOGIN_SUCCESS' }),
      );
    });

    it('logs in with username identifier', async () => {
      prisma.user.findFirst.mockResolvedValue(activeUser);
      prisma.user.update.mockResolvedValue(activeUser);
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await authService.login({
        identifier: 'TestUser',
        password: 'password123',
      });

      expect(result.accessToken).toBe('access-token');
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          OR: [{ email: 'testuser' }, { username: 'testuser' }],
        },
      });
    });

    it('rejects unknown username with generic message', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        authService.login({
          identifier: 'unknown_user',
          password: 'password123',
        }),
      ).rejects.toThrow('Invalid email or password');
    });

    it('denies suspended users', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...activeUser,
        status: UserStatus.SUSPENDED,
      });

      await expect(
        authService.login({
          identifier: 'test@cardon.vn',
          password: 'password123',
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.ACCOUNT_SUSPENDED,
      });
    });

    it('rejects invalid password', async () => {
      prisma.user.findFirst.mockResolvedValue(activeUser);

      await expect(
        authService.login({
          identifier: 'test@cardon.vn',
          password: 'wrong-password',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('issues new tokens for valid refresh token', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue({
        id: 'rt-1',
        user: activeUser,
      });
      prisma.refreshToken.update.mockResolvedValue({});
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await authService.refresh('refresh-token-value');

      expect(result.accessToken).toBe('access-token');
      expect(prisma.refreshToken.update).toHaveBeenCalled();
    });

    it('rejects invalid refresh token', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue(null);

      await expect(authService.refresh('invalid')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('revokes refresh token and blocks reuse after logout', async () => {
      const refreshToken =
        'logout-refresh-token-abc12345678901234567890123456789012';

      prisma.refreshToken.findFirst
        .mockResolvedValueOnce({ id: 'rt-logout-1' })
        .mockResolvedValueOnce(null);
      prisma.refreshToken.update.mockResolvedValue({});

      await authService.logout(activeUser.id, refreshToken);

      expect(prisma.refreshToken.findFirst).toHaveBeenCalledWith({
        where: {
          userId: activeUser.id,
          tokenHash: tokenService.hashToken(refreshToken),
          revokedAt: null,
        },
      });
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-logout-1' },
        data: { revokedAt: expect.any(Date) },
      });

      await expect(authService.refresh(refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});

describe('PermissionsGuard', () => {
  it('denies when role lacks required permission', async () => {
    const rbacService = {
      roleHasAnyPermission: jest.fn().mockResolvedValue(false),
    };

    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['orders.read']),
    };

    const guard = new PermissionsGuard(
      reflector as unknown as Reflector,
      rbacService as never,
    );

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: '1', email: 'c@test.vn', role: UserRole.CUSTOMER },
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };

    await expect(guard.canActivate(context as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
