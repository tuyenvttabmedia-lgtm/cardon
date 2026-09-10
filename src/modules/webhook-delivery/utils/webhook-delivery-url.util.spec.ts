import { BadRequestException } from '@nestjs/common';
import { assertValidWebhookDestination } from './webhook-delivery-url.util';

describe('assertValidWebhookDestination', () => {
  it('accepts public HTTPS destinations', () => {
    const url = assertValidWebhookDestination('https://hooks.example.com/cardon');
    expect(url.hostname).toBe('hooks.example.com');
  });

  it('rejects private IPv4 literals', () => {
    expect(() => assertValidWebhookDestination('https://10.0.0.1/hook')).toThrow(
      BadRequestException,
    );
    expect(() => assertValidWebhookDestination('https://192.168.1.10/hook')).toThrow(
      BadRequestException,
    );
    expect(() => assertValidWebhookDestination('https://172.16.5.1/hook')).toThrow(
      BadRequestException,
    );
    expect(() => assertValidWebhookDestination('https://127.0.0.1/hook')).toThrow(
      BadRequestException,
    );
    expect(() => assertValidWebhookDestination('https://169.254.169.254/latest')).toThrow(
      BadRequestException,
    );
    expect(() => assertValidWebhookDestination('https://0.0.0.0/hook')).toThrow(
      BadRequestException,
    );
  });

  it('rejects IPv6 loopback and cloud metadata hosts', () => {
    expect(() => assertValidWebhookDestination('https://[::1]/hook')).toThrow(
      BadRequestException,
    );
    expect(() =>
      assertValidWebhookDestination('https://metadata.google.internal/computeMetadata/v1/'),
    ).toThrow(BadRequestException);
    expect(() =>
      assertValidWebhookDestination('https://metadata.google.com/computeMetadata/v1/'),
    ).toThrow(BadRequestException);
  });

  it('keeps HTTPS requirement and cardon blocklist', () => {
    expect(() => assertValidWebhookDestination('http://hooks.example.com/x')).toThrow(
      BadRequestException,
    );
    expect(() => assertValidWebhookDestination('https://api.cardon.vn/hook')).toThrow(
      BadRequestException,
    );
  });
});
