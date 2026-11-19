import { promises as dnsPromises } from 'dns';
import { isIP } from 'net';
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

  const [a, b, c] = octets;
  if (a === 0) return true; // 0.0.0.0/8 incl. 0.0.0.0
  if (a === 10) return true; // 10/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  if (a === 127) return true; // 127/8 loopback
  if (a === 169 && b === 254) return true; // 169.254/16 link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0/24 IETF
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15 benchmarking
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

/** True for private/loopback/link-local/metadata IPs (v4 or v6, incl. v4-mapped v6). */
export function isBlockedIpAddress(address: string): boolean {
  const host = address.toLowerCase().replace(/^\[|\]$/g, '');
  const family = isIP(host);
  if (family === 4) return isBlockedIpv4Literal(host);
  if (family !== 6) return false;

  if (host === '::' || host === '::1') return true;

  const mappedDotted = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(host);
  if (mappedDotted) return isBlockedIpv4Literal(mappedDotted[1]);

  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    return isBlockedIpv4Literal(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }

  const first = parseInt(host.split(':')[0] || '0', 16);
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

function isBlockedIpOrMetadataHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (BLOCKED_METADATA_HOSTS.has(host)) return true;
  return isBlockedIpAddress(host);
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

export type WebhookHostLookup = (hostname: string) => Promise<Array<{ address: string }>>;

const defaultHostLookup: WebhookHostLookup = (hostname) =>
  dnsPromises.lookup(hostname, { all: true, verbatim: true });

function isLocalDevHostname(host: string): boolean {
  return (
    host === 'localhost' || host.endsWith('.localhost') || host === 'host.docker.internal'
  );
}

/**
 * Static URL checks + DNS resolution: every resolved address must be public.
 * Stops a public hostname that points at 10.x / 169.254.169.254 / ::1 (SSRF).
 * Residual risk: DNS can change between this lookup and fetch (rebinding); callers must
 * also use `redirect: 'manual'` so redirects cannot hop to internal hosts.
 */
export async function assertWebhookDestinationResolvesPublic(
  urlString: string,
  lookup: WebhookHostLookup = defaultHostLookup,
): Promise<URL> {
  const url = assertValidWebhookDestination(urlString);
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  // IP literals were already validated synchronously.
  if (isIP(host)) return url;
  // Local dev names are only tolerated outside production.
  if (isLocalDevHostname(host) && process.env.NODE_ENV !== 'production') return url;

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host);
  } catch {
    throw new BadRequestException('Webhook URL không phân giải được DNS');
  }
  if (!addresses.length || addresses.some((entry) => isBlockedIpAddress(entry.address))) {
    throw new BadRequestException('Webhook URL phân giải tới địa chỉ nội bộ hoặc không hợp lệ');
  }
  return url;
}
