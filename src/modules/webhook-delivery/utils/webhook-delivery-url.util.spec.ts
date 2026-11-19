import { BadRequestException } from '@nestjs/common';
import {
  assertValidWebhookDestination,
  assertWebhookDestinationResolvesPublic,
  isBlockedIpAddress,
} from './webhook-delivery-url.util';

describe('assertWebhookDestinationResolvesPublic', () => {
  it('accepts hostnames that resolve only to public IPs', async () => {
    const lookup = jest.fn().mockResolvedValue([{ address: '93.184.216.34' }]);
    const url = await assertWebhookDestinationResolvesPublic('https://hooks.example.com/x', lookup);
    expect(url.hostname).toBe('hooks.example.com');
    expect(lookup).toHaveBeenCalledWith('hooks.example.com');
  });

  it.each([
    ['10.0.0.5'],
    ['169.254.169.254'],
    ['127.0.0.1'],
    ['::1'],
    ['fd00::1'],
    ['fe80::1'],
    ['::ffff:10.0.0.1'],
    ['::ffff:7f00:1'],
    ['100.64.0.1'],
  ])('rejects a public hostname that resolves to %s', async (address) => {
    const lookup = jest.fn().mockResolvedValue([{ address: '93.184.216.34' }, { address }]);
    await expect(
      assertWebhookDestinationResolvesPublic('https://evil.example.com/x', lookup),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when DNS lookup fails or returns nothing', async () => {
    await expect(
      assertWebhookDestinationResolvesPublic(
        'https://nx.example.com/x',
        jest.fn().mockRejectedValue(new Error('ENOTFOUND')),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      assertWebhookDestinationResolvesPublic('https://nx.example.com/x', jest.fn().mockResolvedValue([])),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('classifies public addresses as allowed', () => {
    expect(isBlockedIpAddress('8.8.8.8')).toBe(false);
    expect(isBlockedIpAddress('2606:4700:4700::1111')).toBe(false);
  });
});

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
