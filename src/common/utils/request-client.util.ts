import type { Request } from 'express';

/**
 * Client IP for abuse limits / audit.
 * Relies on Express `trust proxy` (configured in main.ts) so forged
 * `X-Forwarded-For` from the public internet is not trusted blindly.
 * Do not parse XFF here — that re-opens spoofing when trust proxy is off/mis-set.
 */
export function extractClientIp(req: Request): string | null {
  const raw = req.ip ?? req.socket?.remoteAddress ?? null;
  if (!raw) return null;
  const ip = raw.startsWith('::ffff:') ? raw.slice(7) : raw;
  return ip.trim() || null;
}

export function extractClientUserAgent(req: Request): string | null {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' && ua.length > 0 ? ua.slice(0, 512) : null;
}

/** Edge country (Cloudflare). Not read from the JSON body. */
export function extractClientCountryCode(req: Request): string | null {
  const raw = req.headers['cf-ipcountry'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z0-9]{2}$/.test(code) ? code : null;
}
