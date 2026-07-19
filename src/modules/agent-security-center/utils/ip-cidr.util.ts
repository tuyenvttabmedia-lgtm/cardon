import { isIPv4, isIPv6 } from 'node:net';

export function validateCidrOrIp(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  if (!trimmed.includes('/')) {
    return isIPv4(trimmed) || isIPv6(trimmed);
  }

  const [ip, prefix] = trimmed.split('/');
  if (!ip || prefix === undefined) return false;
  const bits = Number(prefix);
  if (!Number.isInteger(bits)) return false;

  if (isIPv4(ip)) return bits >= 0 && bits <= 32;
  if (isIPv6(ip)) return bits >= 0 && bits <= 128;
  return false;
}

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function matchIpv4(ip: string, cidr: string): boolean {
  const [network, prefixStr] = cidr.split('/');
  if (!network || prefixStr === undefined) return ip === cidr;
  const prefix = Number(prefixStr);
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(network) & mask);
}

export function ipMatchesEntry(clientIp: string, entryCidr: string): boolean {
  const cidr = entryCidr.trim();
  if (!cidr.includes('/')) {
    return clientIp === cidr;
  }
  if (isIPv4(clientIp) && isIPv4(cidr.split('/')[0] ?? '')) {
    return matchIpv4(clientIp, cidr);
  }
  // IPv6 exact match foundation — full CIDR math deferred
  return clientIp === cidr.split('/')[0];
}

export function isIpAllowed(clientIp: string, entries: Array<{ cidr: string; enabled: boolean }>): boolean {
  const active = entries.filter((e) => e.enabled);
  if (active.length === 0) return true;
  return active.some((e) => ipMatchesEntry(clientIp, e.cidr));
}
