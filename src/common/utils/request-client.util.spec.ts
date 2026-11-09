import type { Request } from 'express';
import { extractClientIp } from './request-client.util';

describe('extractClientIp (trust proxy / anti-spoof)', () => {
  it('uses Express req.ip and ignores forged X-Forwarded-For header body', () => {
    const req = {
      ip: '203.0.113.10',
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
      socket: { remoteAddress: '10.0.0.2' },
    } as unknown as Request;
    expect(extractClientIp(req)).toBe('203.0.113.10');
  });

  it('does not honor XFF when req.ip missing (no blind XFF parse)', () => {
    const req = {
      ip: undefined,
      headers: { 'x-forwarded-for': '8.8.8.8' },
      socket: { remoteAddress: '192.168.1.20' },
    } as unknown as Request;
    expect(extractClientIp(req)).toBe('192.168.1.20');
  });

  it('strips ipv4-mapped ipv6 prefix', () => {
    const req = {
      ip: '::ffff:203.0.113.9',
      headers: {},
      socket: {},
    } as unknown as Request;
    expect(extractClientIp(req)).toBe('203.0.113.9');
  });
});
