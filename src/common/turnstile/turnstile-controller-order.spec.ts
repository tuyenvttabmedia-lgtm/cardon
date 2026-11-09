import { BadRequestException } from '@nestjs/common';
import { AuthController } from '../../modules/auth/auth.controller';
import { SupportAccountController } from '../../modules/support/controllers/support-account.controller';
import {
  TURNSTILE_ACTION_AGENT_REGISTER,
  TURNSTILE_ACTION_REGISTER,
  TURNSTILE_ACTION_SUPPORT_TICKET,
} from './turnstile.constants';

/**
 * Controller-level ordering: Turnstile → Abuse → Business.
 * Captcha failure must not consume W2 quota.
 */
describe('W3 Turnstile controller order (register / agent-register / ticket)', () => {
  const req = { ip: '10.0.0.1', headers: {}, socket: {} } as never;

  function authController(deps: {
    turnstile: { verifyOrThrow: jest.Mock };
    abuse: { consumeOrThrow: jest.Mock };
    auth: { register: jest.Mock };
    agent: { registerPublic: jest.Mock };
  }) {
    return new AuthController(
      deps.auth as never,
      { getPermissionsForRole: jest.fn() } as never,
      deps.agent as never,
      deps.abuse as never,
      deps.turnstile as never,
    );
  }

  function supportController(deps: {
    turnstile: { verifyOrThrow: jest.Mock };
    abuse: { consumeOrThrow: jest.Mock };
    support: { createTicket: jest.Mock };
  }) {
    return new SupportAccountController(
      deps.support as never,
      {} as never,
      deps.abuse as never,
      deps.turnstile as never,
    );
  }

  it('register: flag OFF path still reaches business without captcha hard-fail', async () => {
    const order: string[] = [];
    const turnstile = {
      verifyOrThrow: jest.fn(async () => {
        order.push('turnstile');
      }),
    };
    const abuse = {
      consumeOrThrow: jest.fn(async () => {
        order.push('abuse');
      }),
    };
    const auth = {
      register: jest.fn(async () => {
        order.push('business');
        return { ok: true };
      }),
    };
    const ctrl = authController({
      turnstile,
      abuse,
      auth,
      agent: { registerPublic: jest.fn() },
    });
    const dto = {
      email: 'a@gmail.com',
      captchaToken: undefined,
    } as never;
    await ctrl.register(dto, req);
    expect(order).toEqual(['turnstile', 'abuse', 'business']);
    expect(turnstile.verifyOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ expectedAction: TURNSTILE_ACTION_REGISTER }),
    );
  });

  it('register: captcha fail → abuse not called', async () => {
    const turnstile = {
      verifyOrThrow: jest.fn(async () => {
        throw new BadRequestException('Captcha verification failed');
      }),
    };
    const abuse = { consumeOrThrow: jest.fn() };
    const auth = { register: jest.fn() };
    const ctrl = authController({
      turnstile,
      abuse,
      auth,
      agent: { registerPublic: jest.fn() },
    });
    await expect(
      ctrl.register({ email: 'a@gmail.com', captchaToken: 'x' } as never, req),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(abuse.consumeOrThrow).not.toHaveBeenCalled();
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('register: invalid token rejected; valid token continues', async () => {
    const turnstile = {
      verifyOrThrow: jest
        .fn()
        .mockRejectedValueOnce(new BadRequestException('Captcha verification failed'))
        .mockResolvedValueOnce(undefined),
    };
    const abuse = { consumeOrThrow: jest.fn() };
    const auth = { register: jest.fn().mockResolvedValue({ ok: true }) };
    const ctrl = authController({
      turnstile,
      abuse,
      auth,
      agent: { registerPublic: jest.fn() },
    });
    await expect(
      ctrl.register({ email: 'a@gmail.com', captchaToken: 'bad' } as never, req),
    ).rejects.toBeInstanceOf(BadRequestException);
    await ctrl.register({ email: 'a@gmail.com', captchaToken: 'good' } as never, req);
    expect(abuse.consumeOrThrow).toHaveBeenCalledTimes(1);
    expect(auth.register).toHaveBeenCalledTimes(1);
  });

  it('agent-register: turnstile before abuse with agent-register action', async () => {
    const order: string[] = [];
    const turnstile = {
      verifyOrThrow: jest.fn(async () => {
        order.push('turnstile');
      }),
    };
    const abuse = {
      consumeOrThrow: jest.fn(async () => {
        order.push('abuse');
      }),
    };
    const agent = {
      registerPublic: jest.fn(async () => {
        order.push('business');
        return { ok: true };
      }),
    };
    const ctrl = authController({
      turnstile,
      abuse,
      auth: { register: jest.fn() },
      agent,
    });
    await ctrl.agentRegister({ email: 'b@gmail.com', captchaToken: 't' } as never, req);
    expect(order).toEqual(['turnstile', 'abuse', 'business']);
    expect(turnstile.verifyOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ expectedAction: TURNSTILE_ACTION_AGENT_REGISTER }),
    );
  });

  it('support ticket: captcha fail skips abuse', async () => {
    const order: string[] = [];
    const turnstile = {
      verifyOrThrow: jest.fn(async () => {
        order.push('turnstile');
        throw new BadRequestException('Captcha verification failed');
      }),
    };
    const abuse = {
      consumeOrThrow: jest.fn(async () => {
        order.push('abuse');
      }),
    };
    const support = { createTicket: jest.fn() };
    const ctrl = supportController({ turnstile, abuse, support });
    await expect(
      ctrl.createTicket(
        { id: 'u1' } as never,
        { subject: 'Help', message: 'Need help', captchaToken: 'x' } as never,
        req,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(order).toEqual(['turnstile']);
    expect(abuse.consumeOrThrow).not.toHaveBeenCalled();
  });

  it('support ticket: valid captcha then abuse then business', async () => {
    const order: string[] = [];
    const turnstile = {
      verifyOrThrow: jest.fn(async () => {
        order.push('turnstile');
      }),
    };
    const abuse = {
      consumeOrThrow: jest.fn(async () => {
        order.push('abuse');
      }),
    };
    const support = {
      createTicket: jest.fn(async () => {
        order.push('business');
        return { id: 't1' };
      }),
    };
    const ctrl = supportController({ turnstile, abuse, support });
    await ctrl.createTicket(
      { id: 'u1' } as never,
      { subject: 'Help', message: 'Need help', captchaToken: 'ok' } as never,
      req,
    );
    expect(turnstile.verifyOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ expectedAction: TURNSTILE_ACTION_SUPPORT_TICKET }),
    );
    expect(order).toEqual(['turnstile', 'abuse', 'business']);
  });
});
