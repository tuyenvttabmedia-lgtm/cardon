import {
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { validate } from 'class-validator';
import { AuthService } from './auth.service';
import { AuditService } from './audit.service';
import { RegisterDto } from './dto/register.dto';
import { TokenService } from './token.service';

function validRegisterDto(): RegisterDto {
  const dto = new RegisterDto();
  dto.username = 'customer01';
  dto.fullName = 'Nguyen Van A';
  dto.email = 'customer@cardon.vn';
  dto.phone = '0912345678';
  dto.password = 'password123';
  dto.confirmPassword = 'password123';
  dto.identityNumber = '123456789012';
  dto.acceptTerms = true;
  return dto;
}

describe('Phase 5A.2 — Customer registration', () => {
  it('validates required fields and terms acceptance', async () => {
    const dto = validRegisterDto();
    dto.acceptTerms = false;
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'acceptTerms')).toBe(true);
  });

  it('rejects mismatched confirmPassword', async () => {
    const dto = validRegisterDto();
    dto.confirmPassword = 'different-password';
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'confirmPassword')).toBe(true);
  });

  it('rejects invalid phone format', async () => {
    const dto = validRegisterDto();
    dto.phone = '12345';
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'phone')).toBe(true);
  });

  it('accepts valid registration payload', async () => {
    const errors = await validate(validRegisterDto());
    expect(errors).toHaveLength(0);
  });
});

describe('Phase 5A.2 — AuthService register & password reset', () => {
  let authService: AuthService;
  let prisma: {
    user: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
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
    $transaction: jest.Mock;
  };
  let tokenService: {
    buildJwtPayload: jest.Mock;
    generateAccessToken: jest.Mock;
    generateRefreshTokenValue: jest.Mock;
    hashToken: jest.Mock;
    getRefreshTokenExpiryDate: jest.Mock;
  };
  let settingsEncryption: { encrypt: jest.Mock; decrypt: jest.Mock };
  let notifyUserRegister: jest.Mock;
  let notifyPasswordReset: jest.Mock;

  const activeUser = {
    id: 'user-1',
    username: 'customer01',
    fullName: 'Nguyen Van A',
    email: 'customer@cardon.vn',
    phone: '0912345678',
    passwordHash: '',
    role: UserRole.CUSTOMER,
    status: UserStatus.ACTIVE,
    emailVerifiedAt: null,
    deletedAt: null,
  };

  beforeEach(async () => {
    activeUser.passwordHash = await bcrypt.hash('password123', 12);

    prisma = {
      user: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
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

    settingsEncryption = {
      encrypt: jest.fn().mockReturnValue('enc:identity'),
      decrypt: jest.fn(),
    };

    notifyUserRegister = jest.fn();
    notifyPasswordReset = jest.fn();

    authService = new AuthService(
      prisma as never,
      tokenService as unknown as TokenService,
      { recordSecurityEvent: jest.fn() } as unknown as AuditService,
      {
        notifyUserRegister,
        notifyPasswordReset,
      } as never,
      settingsEncryption as never,
    );
  });

  it('stores profile fields and encrypts identity number', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(activeUser);
    prisma.emailVerificationToken.create.mockResolvedValue({});
    prisma.refreshToken.create.mockResolvedValue({});

    const dto = validRegisterDto();
    const result = await authService.register(dto);

    expect(result.user.username).toBe('customer01');
    expect(result.user.fullName).toBe('Nguyen Van A');
    expect(settingsEncryption.encrypt).toHaveBeenCalledWith('123456789012');
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          username: 'customer01',
          fullName: 'Nguyen Van A',
          phone: '0912345678',
          identityNumberEnc: 'enc:identity',
          acceptedTermsAt: expect.any(Date),
        }),
      }),
    );
    expect(result.user).not.toHaveProperty('identityNumber');
    expect(result.user).not.toHaveProperty('identityNumberEnc');
  });

  it('rejects duplicate username', async () => {
    prisma.user.findFirst.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      if (where.email) return Promise.resolve(null);
      if (where.username) return Promise.resolve({ id: 'other-user' });
      return Promise.resolve(null);
    });

    await expect(authService.register(validRegisterDto())).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('forgot password returns generic message without leaking token', async () => {
    prisma.user.findFirst.mockResolvedValue(activeUser);
    prisma.passwordResetToken.create.mockResolvedValue({});

    const result = await authService.forgotPassword({
      email: 'customer@cardon.vn',
    });

    expect(result.message).toContain('If an account exists');
    expect(JSON.stringify(result)).not.toContain('refresh-token-value');
    expect(notifyPasswordReset).toHaveBeenCalled();
  });

  it('reset password rejects invalid token', async () => {
    prisma.passwordResetToken.findFirst.mockResolvedValue(null);

    await expect(
      authService.resetPassword({
        token: 'x'.repeat(32),
        newPassword: 'newpassword123',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
