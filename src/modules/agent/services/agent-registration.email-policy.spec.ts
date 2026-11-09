import { BadRequestException, ConflictException } from '@nestjs/common';
import { AgentRegisterAccountType } from '../../auth/dto/agent-register.dto';
import { EMAIL_POLICY_REJECT_MESSAGE } from '../../../common/email-policy/email-policy.constants';
import { AgentRegistrationService } from './agent-registration.service';

describe('AgentRegistrationService — W1 email policy', () => {
  function buildService(emailPolicy: {
    assertRegistrationEmailAllowed: jest.Mock;
  }) {
    const prisma: {
      user: { findFirst: jest.Mock; create: jest.Mock };
      agent: { create: jest.Mock };
      emailVerificationToken: { create: jest.Mock };
      $transaction: jest.Mock;
    } = {
      user: { findFirst: jest.fn(), create: jest.fn() },
      agent: { create: jest.fn() },
      emailVerificationToken: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    );
    const agentInviteService = {
      requireInviteForMode: jest.fn().mockResolvedValue(null),
      consumeInvite: jest.fn(),
    };
    const service = new AgentRegistrationService(
      prisma as never,
      agentInviteService as never,
      { recordRegistered: jest.fn() } as never,
      {
        buildJwtPayload: jest.fn(),
        generateAccessToken: jest.fn(),
        generateRefreshTokenValue: jest.fn(),
        hashToken: jest.fn(),
        getRefreshTokenExpiryDate: jest.fn(),
      } as never,
      { notifyAgentVerifyEmail: jest.fn() } as never,
      { get: jest.fn() } as never,
      { assertLoginAllowed: jest.fn() } as never,
      emailPolicy as never,
    );
    return { service, prisma, agentInviteService };
  }

  const baseDto = {
    accountType: AgentRegisterAccountType.PERSONAL,
    email: 'partner@cardon.vn',
    phone: '0912345678',
    password: 'password123',
    confirmPassword: 'password123',
    acceptTerms: true as const,
  };

  it('rejects reserved email before invite / create', async () => {
    const emailPolicy = {
      assertRegistrationEmailAllowed: jest.fn(() => {
        throw new BadRequestException(EMAIL_POLICY_REJECT_MESSAGE);
      }),
    };
    const { service, prisma, agentInviteService } = buildService(emailPolicy);

    await expect(
      service.registerPublic({ ...baseDto, email: 'agent@example.com' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(emailPolicy.assertRegistrationEmailAllowed).toHaveBeenCalledWith(
      'agent@example.com',
    );
    expect(agentInviteService.requireInviteForMode).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('continues when email policy allows', async () => {
    const emailPolicy = {
      assertRegistrationEmailAllowed: jest.fn(),
    };
    const { service, prisma } = buildService(emailPolicy);
    prisma.user.findFirst.mockResolvedValue({ id: 'existing' });

    await expect(service.registerPublic(baseDto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(emailPolicy.assertRegistrationEmailAllowed).toHaveBeenCalledWith(
      'partner@cardon.vn',
    );
  });
});
