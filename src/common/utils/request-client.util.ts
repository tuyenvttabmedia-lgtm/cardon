import type { Request } from 'express';

export function extractClientIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() ?? null;
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(',')[0]?.trim() ?? null;
  }
  return req.ip ?? req.socket?.remoteAddress ?? null;
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
