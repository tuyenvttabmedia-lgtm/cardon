import { BadRequestException } from '@nestjs/common';
import { WEBHOOK_BLOCKED_HOST_SUFFIXES } from '../entities/webhook-delivery.constants';

const BLOCKED_METADATA_HOSTS = new Set([
  'metadata.google.internal',
  'metadata.google.com',
]);

function isBlockedIpv4Literal(hostname: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!match) return false;

  const octets = match.slice(1, 5).map(Number);
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }

  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8 incl. 0.0.0.0
  if (a === 10) return true; // 10/8
  if (a === 127) return true; // 127/8 loopback
  if (a === 169 && b === 254) return true; // 169.254/16 link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  return false;
}

function isBlockedIpOrMetadataHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (BLOCKED_METADATA_HOSTS.has(host)) return true;
  if (host === '::1') return true;
  return isBlockedIpv4Literal(host);
}

export function assertValidWebhookDestination(urlString: string): URL {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new BadRequestException('Webhook URL không hợp lệ');
  }

  const host = url.hostname.toLowerCase();
  const isLocalDev =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.localhost') ||
    host === 'host.docker.internal';

  if (url.protocol !== 'https:' && !isLocalDev) {
    throw new BadRequestException('Webhook URL phải dùng HTTPS');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestException('Webhook URL phải dùng HTTP hoặc HTTPS');
  }

  if (isBlockedIpOrMetadataHost(host)) {
    throw new BadRequestException('Webhook URL không được trỏ tới địa chỉ nội bộ hoặc metadata');
  }

  for (const blocked of WEBHOOK_BLOCKED_HOST_SUFFIXES) {
    if (host === blocked || host.endsWith(`.${blocked}`)) {
      if (blocked === 'localhost' || blocked === '127.0.0.1') {
        if (isLocalDev) continue;
      }
      throw new BadRequestException('Webhook URL không được trỏ về hệ thống CardOn');
    }
  }

  if (url.pathname.includes('/api/partner/') || url.pathname.includes('/api/v1/payments/webhook')) {
    throw new BadRequestException('Webhook URL không hợp lệ — ngăn vòng lặp callback');
  }

  return url;
}
