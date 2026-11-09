import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { OrderController } from './controllers/order.controller';

describe('W5 guest order protection (OrderController)', () => {
  const orderService = { createOrder: jest.fn() };
  const orderDeliveryService = {};
  const turnstile = { verifyOrThrow: jest.fn() };
  const abuseRateLimit = { consumeFailOpen: jest.fn() };
  const emailPolicy = { assertRegistrationEmailAllowed: jest.fn() };

  const controller = new OrderController(
    orderService as never,
    orderDeliveryService as never,
    turnstile as never,
    abuseRateLimit as never,
    emailPolicy as never,
  );

  const guestDto = {
    items: [{ variantId: '11111111-1111-4111-8111-111111111111', quantity: 1 }],
    guestEmail: 'buyer@gmail.com',
    captchaToken: 'tok',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    orderService.createOrder.mockResolvedValue({ id: 'o1' });
    turnstile.verifyOrThrow.mockResolvedValue(undefined);
    abuseRateLimit.consumeFailOpen.mockResolvedValue(undefined);
    emailPolicy.assertRegistrationEmailAllowed.mockReset();
    emailPolicy.assertRegistrationEmailAllowed.mockImplementation(() => undefined);
  });

  it('guest: turnstile → email policy → fail-open abuse → create', async () => {
    await controller.createOrder(guestDto as never, undefined, {
      headers: {},
      socket: { remoteAddress: '1.2.3.4' },
    } as never);

    expect(turnstile.verifyOrThrow).toHaveBeenCalled();
    expect(emailPolicy.assertRegistrationEmailAllowed).toHaveBeenCalledWith(
      'buyer@gmail.com',
    );
    expect(abuseRateLimit.consumeFailOpen).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: 'order_create', email: 'buyer@gmail.com' }),
    );
    expect(orderService.createOrder).toHaveBeenCalled();
  });

  it('guest reserved email is rejected', async () => {
    emailPolicy.assertRegistrationEmailAllowed.mockImplementation(() => {
      throw new BadRequestException('Email domain is not allowed');
    });
    await expect(
      controller.createOrder(
        { ...guestDto, guestEmail: 'x@example.com' } as never,
        undefined,
        { headers: {}, socket: { remoteAddress: '1.2.3.4' } } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(orderService.createOrder).not.toHaveBeenCalled();
  });

  it('authenticated: skips turnstile + email policy; abuse userId only (no guest IP)', async () => {
    await controller.createOrder(
      { items: guestDto.items } as never,
      { id: 'u1', email: 'u@gmail.com' } as never,
      { headers: {}, socket: { remoteAddress: '1.2.3.4' } } as never,
    );
    expect(turnstile.verifyOrThrow).not.toHaveBeenCalled();
    expect(emailPolicy.assertRegistrationEmailAllowed).not.toHaveBeenCalled();
    expect(abuseRateLimit.consumeFailOpen).toHaveBeenCalledWith({
      bucket: 'order_create',
      ip: undefined,
      userId: 'u1',
      email: undefined,
    });
  });

  it('guest: abuse uses ip + email, not userId', async () => {
    await controller.createOrder(guestDto as never, undefined, {
      headers: {},
      socket: { remoteAddress: '1.2.3.4' },
    } as never);
    expect(abuseRateLimit.consumeFailOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'order_create',
        email: 'buyer@gmail.com',
        userId: undefined,
      }),
    );
  });

  it('guest + Turnstile enabled path: missing token fails before create', async () => {
    turnstile.verifyOrThrow.mockRejectedValue(new BadRequestException('Captcha verification failed'));
    await expect(
      controller.createOrder(
        { ...guestDto, captchaToken: undefined } as never,
        undefined,
        { headers: {}, socket: { remoteAddress: '1.2.3.4' } } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(orderService.createOrder).not.toHaveBeenCalled();
  });

  it('propagates 429 from fail-open abuse', async () => {
    abuseRateLimit.consumeFailOpen.mockRejectedValue(
      new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS),
    );
    await expect(
      controller.createOrder(guestDto as never, undefined, {
        headers: {},
        socket: { remoteAddress: '1.2.3.4' },
      } as never),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
  });
});
