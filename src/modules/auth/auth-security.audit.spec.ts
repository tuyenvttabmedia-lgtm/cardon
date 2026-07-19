/**
 * Phase 2B.1 — Auth Security Audit Tests
 * Validates security controls documented in docs/PHASE_2B1_AUTH_SECURITY_AUDIT.md
 */
import {
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { ErrorCode } from '../../common/constants/error-codes.constants';
import { AUDIT_ACTIONS } from './auth.constants';
import { AuthService } from './auth.service';
import { AuditService } from './audit.service';
import { PermissionsGuard } from './guards/permissions.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenService } from './token.service';
import { RbacService } from '../rbac/rbac.service';
import { PermissionCacheService } from '../rbac/permission-cache.service';

const noopNotification = {
  notifyUserRegister: jest.fn(),
  notifyPasswordReset: jest.fn(),
} as never;

describe('Phase 2B.1 Auth Security Audit', () => {
  describe('CHECK 1: Refresh token security', () => {
    let authService: AuthService;
    let prisma: {
      refreshToken: {
        findFirst: jest.Mock;
        update: jest.Mock;
        create: jest.Mock;
      };
      user: { update: jest.Mock };
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
      email: 'audit@cardon.vn',
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: null,
      deletedAt: null,
    };

    beforeEach(() => {
      prisma = {
        refreshToken: {
          findFirst: jest.fn(),
          update: jest.fn(),
          create: jest.fn(),
        },
        user: { update: jest.fn() },
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
        generateRefreshTokenValue: jest.fn().mockReturnValue('new-refresh-token'),
        hashToken: jest.fn((t: string) => createHash('sha256').update(t).digest('hex')),
        getRefreshTokenExpiryDate: jest
          .fn()
          .mockReturnValue(new Date(Date.now() + 86400000)),
      };

      auditService = { recordSecurityEvent: jest.fn() };

      authService = new AuthService(
        { refreshToken: prisma.refreshToken, user: prisma.user } as never,
        tokenService as unknown as TokenService,
        auditService as unknown as AuditService,
        noopNotification,
        { encrypt: jest.fn(), decrypt: jest.fn() } as never,
        { dispatch: jest.fn() } as never,
      );
    });

    it('rejects old refresh token after rotation', async () => {
      const oldToken = 'old-refresh-token-before-rotation-abc123456789012345678901234';
      prisma.refreshToken.findFirst.mockResolvedValueOnce({
        id: 'rt-1',
        user: activeUser,
      });
      prisma.refreshToken.update.mockResolvedValue({});
      prisma.refreshToken.create.mockResolvedValue({});

      await authService.refresh(oldToken);

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: { revokedAt: expect.any(Date) },
      });

      prisma.refreshToken.findFirst.mockResolvedValue(null);

      await expect(authService.refresh(oldToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects refresh token after logout', async () => {
      const refreshToken =
        'logged-out-refresh-token-abc12345678901234567890123456789012';

      prisma.refreshToken.findFirst
        .mockResolvedValueOnce({ id: 'rt-logout' })
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
        where: { id: 'rt-logout' },
        data: { revokedAt: expect.any(Date) },
      });

      await expect(authService.refresh(refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('CHECK 2: User status enforcement', () => {
    let authService: AuthService;
    let prisma: { user: { findFirst: jest.Mock; update: jest.Mock } };
    let auditService: { recordSecurityEvent: jest.Mock };
    let jwtStrategy: JwtStrategy;

    const activeUser = {
      id: 'user-2',
      email: 'status@cardon.vn',
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
          update: jest.fn(),
        },
      };

      auditService = { recordSecurityEvent: jest.fn() };

      authService = new AuthService(
        {
          user: prisma.user,
          refreshToken: { create: jest.fn() },
        } as never,
        {
          buildJwtPayload: jest.fn(),
          generateAccessToken: jest.fn().mockReturnValue({
            token: 'access',
            expiresIn: 900,
          }),
          generateRefreshTokenValue: jest.fn().mockReturnValue('refresh'),
          hashToken: jest.fn(),
          getRefreshTokenExpiryDate: jest.fn().mockReturnValue(new Date()),
        } as never,
        auditService as never,
        noopNotification,
        { encrypt: jest.fn(), decrypt: jest.fn() } as never,
        { dispatch: jest.fn() } as never,
      );

      jwtStrategy = Object.create(JwtStrategy.prototype) as JwtStrategy;
      (jwtStrategy as unknown as { prisma: typeof prisma }).prisma =
        prisma as never;
    });

    it('allows ACTIVE user login', async () => {
      prisma.user.findFirst.mockResolvedValue(activeUser);
      prisma.user.update.mockResolvedValue(activeUser);

      const result = await authService.login({
        identifier: 'status@cardon.vn',
        password: 'password123',
      });

      expect(result.accessToken).toBe('access');
    });

    it('denies SUSPENDED user at login', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...activeUser,
        status: UserStatus.SUSPENDED,
      });

      await expect(
        authService.login({
          identifier: 'status@cardon.vn',
          password: 'password123',
        }),
      ).rejects.toMatchObject({ code: ErrorCode.ACCOUNT_SUSPENDED });
    });

    it('denies SUSPENDED user with existing access token (JwtStrategy)', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...activeUser,
        status: UserStatus.SUSPENDED,
      });

      await expect(
        jwtStrategy.validate({
          sub: activeUser.id,
          email: activeUser.email,
          role: UserRole.CUSTOMER,
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('denies BANNED user at login', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...activeUser,
        status: UserStatus.BANNED,
      });

      await expect(
        authService.login({
          identifier: 'status@cardon.vn',
          password: 'password123',
        }),
      ).rejects.toMatchObject({ code: ErrorCode.ACCOUNT_SUSPENDED });
    });

    it('denies BANNED user with existing access token (JwtStrategy)', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...activeUser,
        status: UserStatus.BANNED,
      });

      await expect(
        jwtStrategy.validate({
          sub: activeUser.id,
          email: activeUser.email,
          role: UserRole.CUSTOMER,
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('CHECK 3: RBAC correctness', () => {
    let rbacService: RbacService;
    let permissionCache: PermissionCacheService;
    let prisma: { rolePermission: { findMany: jest.Mock } };
    let permissionsGuard: PermissionsGuard;

    const supportPermissions = [
      'users.read',
      'orders.read',
      'orders.retry',
      'payments.view',
    ];

    const allPermissions = [
      'users.read',
      'orders.read',
      'orders.retry',
      'payments.view',
      'ledger.view',
      'providers.manage',
      'pricing.manage',
      'invoice.manage',
      'cms.manage',
      'settings.manage',
    ];

    beforeEach(() => {
      prisma = { rolePermission: { findMany: jest.fn() } };
      permissionCache = new PermissionCacheService({
        user: { findFirst: jest.fn() },
      } as never);
      rbacService = new RbacService(prisma as never, permissionCache);

      permissionsGuard = new PermissionsGuard(
        {
          getAllAndOverride: jest.fn().mockReturnValue(['orders.read']),
        } as unknown as Reflector,
        rbacService,
      );
    });

    it('denies CUSTOMER access to admin permission', async () => {
      prisma.rolePermission.findMany.mockResolvedValue([]);

      await expect(
        permissionsGuard.canActivate({
          switchToHttp: () => ({
            getRequest: () => ({
              user: {
                id: '1',
                email: 'c@test.vn',
                role: UserRole.CUSTOMER,
              },
            }),
          }),
          getHandler: () => ({}),
          getClass: () => ({}),
        } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows SUPPORT only permitted permissions', async () => {
      prisma.rolePermission.findMany.mockImplementation(({ where }) => {
        const codes =
          where.role === UserRole.SUPPORT ? supportPermissions : allPermissions;
        return Promise.resolve(codes.map((code) => ({ permission: { code } })));
      });

      expect(
        await rbacService.roleHasPermission(UserRole.SUPPORT, 'orders.read'),
      ).toBe(true);
      expect(
        await rbacService.roleHasPermission(UserRole.SUPPORT, 'settings.manage'),
      ).toBe(false);
    });

    it('allows SUPER_ADMIN all permissions via database', async () => {
      prisma.rolePermission.findMany.mockResolvedValue(
        allPermissions.map((code) => ({ permission: { code } })),
      );

      expect(
        await rbacService.roleHasPermission(
          UserRole.SUPER_ADMIN,
          'settings.manage',
        ),
      ).toBe(true);
      expect(
        await rbacService.roleHasPermission(UserRole.SUPER_ADMIN, 'cms.manage'),
      ).toBe(true);
    });
  });

  describe('CHECK 4: Permission changes from database', () => {
    it('reflects DB permission removal after notifyRolePermissionsChanged', async () => {
      const prisma = {
        rolePermission: {
          findMany: jest
            .fn()
            .mockResolvedValueOnce([
              { permission: { code: 'orders.read' } },
            ])
            .mockResolvedValueOnce([]),
        },
      };
      const permissionCache = new PermissionCacheService({
        user: { findFirst: jest.fn() },
      } as never);
      const rbac = new RbacService(prisma as never, permissionCache);

      expect(
        await rbac.roleHasPermission(UserRole.SUPPORT, 'orders.read'),
      ).toBe(true);

      rbac.notifyRolePermissionsChanged(UserRole.SUPPORT);

      expect(
        await rbac.roleHasPermission(UserRole.SUPPORT, 'orders.read'),
      ).toBe(false);
    });

    it('uses cache within TTL when role permissions unchanged', async () => {
      const prisma = {
        rolePermission: {
          findMany: jest
            .fn()
            .mockResolvedValueOnce([{ permission: { code: 'orders.read' } }])
            .mockResolvedValueOnce([]),
        },
      };
      const permissionCache = new PermissionCacheService({
        user: { findFirst: jest.fn() },
      } as never);
      const rbac = new RbacService(prisma as never, permissionCache);

      expect(
        await rbac.roleHasPermission(UserRole.SUPPORT, 'orders.read'),
      ).toBe(true);

      expect(
        await rbac.roleHasPermission(UserRole.SUPPORT, 'orders.read'),
      ).toBe(true);
      expect(prisma.rolePermission.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('CHECK 5: Password reset security', () => {
    let authService: AuthService;
    let prisma: {
      passwordResetToken: {
        create: jest.Mock;
        findFirst: jest.Mock;
        update: jest.Mock;
      };
      user: { findFirst: jest.Mock; update: jest.Mock };
      refreshToken: { updateMany: jest.Mock };
      $transaction: jest.Mock;
    };
    let tokenService: {
      generateRefreshTokenValue: jest.Mock;
      hashToken: jest.Mock;
    };
    const rawResetToken =
      'reset-token-plain-abc123456789012345678901234567890123456';

    beforeEach(() => {
      tokenService = {
        generateRefreshTokenValue: jest.fn().mockReturnValue(rawResetToken),
        hashToken: jest.fn((t: string) =>
          createHash('sha256').update(t).digest('hex'),
        ),
      };

      prisma = {
        user: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'user-3',
            status: UserStatus.ACTIVE,
            deletedAt: null,
          }),
          update: jest.fn(),
        },
        passwordResetToken: {
          create: jest.fn(),
          findFirst: jest.fn(),
          update: jest.fn(),
        },
        refreshToken: { updateMany: jest.fn() },
        $transaction: jest.fn((ops) => Promise.all(ops)),
      };

      authService = new AuthService(
        prisma as never,
        tokenService as unknown as TokenService,
        { recordSecurityEvent: jest.fn() } as never,
        noopNotification,
        { encrypt: jest.fn(), decrypt: jest.fn() } as never,
        { dispatch: jest.fn() } as never,
      );
    });

    it('stores reset token hashed, not plain text', async () => {
      await authService.forgotPassword({ email: 'reset@cardon.vn' });

      const createCall = prisma.passwordResetToken.create.mock.calls[0][0];
      expect(createCall.data.tokenHash).not.toBe(rawResetToken);
      expect(createCall.data.tokenHash).toBe(
        createHash('sha256').update(rawResetToken).digest('hex'),
      );
      expect(createCall.data.expiresAt).toBeInstanceOf(Date);
    });

    it('rejects expired reset token', async () => {
      prisma.passwordResetToken.findFirst.mockResolvedValue(null);

      await expect(
        authService.resetPassword({
          token: rawResetToken,
          newPassword: 'newpassword123',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('marks reset token single-use and revokes all refresh tokens', async () => {
      prisma.passwordResetToken.findFirst.mockResolvedValue({
        id: 'prt-1',
        userId: 'user-3',
        user: { id: 'user-3', deletedAt: null },
      });

      await authService.resetPassword({
        token: rawResetToken,
        newPassword: 'newpassword123',
      });

      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: 'prt-1' },
        data: { usedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-3', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('CHECK 6: Audit log events', () => {
    let authService: AuthService;
    let auditService: { recordSecurityEvent: jest.Mock };
    let prisma: Record<string, unknown>;

    const user = {
      id: 'user-4',
      email: 'audit@cardon.vn',
      passwordHash: '',
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
      deletedAt: null,
    };

    beforeEach(async () => {
      user.passwordHash = await bcrypt.hash('password123', 12);
      auditService = { recordSecurityEvent: jest.fn() };

      prisma = {
        user: {
          findFirst: jest.fn(),
          update: jest.fn(),
        },
        refreshToken: {
          create: jest.fn(),
          findFirst: jest.fn().mockResolvedValue(null),
          update: jest.fn(),
          updateMany: jest.fn(),
        },
        passwordResetToken: { create: jest.fn() },
      };

      authService = new AuthService(
        prisma as never,
        {
          buildJwtPayload: jest.fn(),
          generateAccessToken: jest.fn().mockReturnValue({
            token: 'access',
            expiresIn: 900,
          }),
          generateRefreshTokenValue: jest.fn().mockReturnValue('refresh'),
          hashToken: jest.fn(),
          getRefreshTokenExpiryDate: jest.fn().mockReturnValue(new Date()),
        } as never,
        auditService as unknown as AuditService,
        noopNotification,
        { encrypt: jest.fn(), decrypt: jest.fn() } as never,
        { dispatch: jest.fn() } as never,
      );
    });

    it('records LOGIN_SUCCESS', async () => {
      (prisma.user as { findFirst: jest.Mock }).findFirst.mockResolvedValue(user);
      (prisma.user as { update: jest.Mock }).update.mockResolvedValue(user);
      (prisma.refreshToken as { create: jest.Mock }).create.mockResolvedValue(
        {},
      );

      await authService.login({
        identifier: 'audit@cardon.vn',
        password: 'password123',
      });

      expect(auditService.recordSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: AUDIT_ACTIONS.LOGIN_SUCCESS }),
      );
    });

    it('records LOGIN_FAILED', async () => {
      (prisma.user as { findFirst: jest.Mock }).findFirst.mockResolvedValue(user);

      await expect(
        authService.login({
          identifier: 'audit@cardon.vn',
          password: 'wrong-password',
        }),
      ).rejects.toThrow();

      expect(auditService.recordSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: AUDIT_ACTIONS.LOGIN_FAILED }),
      );
    });

    it('records LOGOUT', async () => {
      await authService.logout('user-4', 'refresh-token');

      expect(auditService.recordSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: AUDIT_ACTIONS.LOGOUT }),
      );
    });

    it('records PASSWORD_RESET_REQUEST', async () => {
      (prisma.user as { findFirst: jest.Mock }).findFirst.mockResolvedValue(user);
      (prisma.passwordResetToken as { create: jest.Mock }).create.mockResolvedValue(
        {},
      );

      await authService.forgotPassword({ email: 'audit@cardon.vn' });

      expect(auditService.recordSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AUDIT_ACTIONS.PASSWORD_RESET_REQUEST,
        }),
      );
    });
  });

  describe('CHECK 7: Bruteforce protection', () => {
    it('applies @Throttle on login endpoint via AUTH_LOGIN_THROTTLE', () => {
      const { readFileSync } = require('fs') as typeof import('fs');
      const { join } = require('path') as typeof import('path');
      const source = readFileSync(join(__dirname, 'auth.controller.ts'), 'utf8');

      expect(source).toContain("@Post('login')");
      expect(source).toContain('@Throttle({ default: AUTH_LOGIN_THROTTLE })');
    });

    it('applies @Throttle on refresh endpoint via AUTH_REFRESH_THROTTLE', () => {
      const { readFileSync } = require('fs') as typeof import('fs');
      const { join } = require('path') as typeof import('path');
      const source = readFileSync(join(__dirname, 'auth.controller.ts'), 'utf8');

      const refreshBlock = source.slice(
        source.indexOf("@Post('refresh')") - 120,
        source.indexOf("@Post('refresh')") + 80,
      );
      expect(refreshBlock).toContain('@Throttle({ default: AUTH_REFRESH_THROTTLE })');
    });
  });

  describe('CHECK L-02: Password reset token logging', () => {
    it('never logs reset token in auth.service source', async () => {
      const { readFileSync } = require('fs') as typeof import('fs');
      const { join } = require('path') as typeof import('path');
      const source = readFileSync(join(__dirname, 'auth.service.ts'), 'utf8');

      expect(source).not.toMatch(/Password reset token/);
      expect(source).not.toMatch(/logger\.debug\(.*rawToken/);
    });

    it('does not log reset token in production', async () => {
      const originalEnv = process.env.APP_ENV;
      process.env.APP_ENV = 'production';

      const logger = { debug: jest.fn() };
      const prisma = {
        user: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'user-prod',
            status: UserStatus.ACTIVE,
            deletedAt: null,
          }),
        },
        passwordResetToken: { create: jest.fn() },
      };
      const tokenService = {
        generateRefreshTokenValue: jest.fn().mockReturnValue('secret-reset-token'),
        hashToken: jest.fn().mockReturnValue('hash'),
      };

      const service = new AuthService(
        prisma as never,
        tokenService as never,
        { recordSecurityEvent: jest.fn() } as never,
        noopNotification,
        { encrypt: jest.fn(), decrypt: jest.fn() } as never,
        { dispatch: jest.fn() } as never,
      );
      (service as unknown as { logger: typeof logger }).logger = logger;

      await service.forgotPassword({ email: 'prod@cardon.vn' });

      expect(logger.debug).not.toHaveBeenCalled();

      process.env.APP_ENV = originalEnv;
    });
  });
});
