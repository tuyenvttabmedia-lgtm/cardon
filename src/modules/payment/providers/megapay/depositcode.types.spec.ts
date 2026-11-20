import { ServiceUnavailableException } from '@nestjs/common';
import { isTransientMegapayWebhookError } from './depositcode.types';

describe('isTransientMegapayWebhookError', () => {
  it('treats 5xx HttpExceptions as transient', () => {
    expect(
      isTransientMegapayWebhookError(new ServiceUnavailableException('redis')),
    ).toBe(true);
  });

  it('treats DB/Redis connection messages as transient', () => {
    expect(isTransientMegapayWebhookError(new Error('P1001: unreachable'))).toBe(
      true,
    );
    expect(
      isTransientMegapayWebhookError(new Error('Connection is closed')),
    ).toBe(true);
  });

  it('does not treat business validation as transient', () => {
    expect(isTransientMegapayWebhookError(new Error('Invalid amount'))).toBe(
      false,
    );
    expect(isTransientMegapayWebhookError(new Error('Payment not found'))).toBe(
      false,
    );
  });
});
