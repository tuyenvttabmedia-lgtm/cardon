import { getSiteUrl } from '@/lib/utils';

/** Browser-facing media URL. Never emit Docker-internal hosts like api:3000. */

const INTERNAL_IMAGE_HOSTS = new Set([
  'api',
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  'web',
]);

function isInternalImageHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return INTERNAL_IMAGE_HOSTS.has(host) || host.endsWith('.local');
}

/** Turn an internal or relative upload path into a same-origin path the browser can load. */
export function resolveAssetUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const trimmed = url.trim();

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      if (isInternalImageHost(parsed.hostname)) {
        return `${parsed.pathname}${parsed.search}`;
      }
    } catch {
      return trimmed;
    }
    return trimmed;
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/**
 * Src for next/image. Upload files live on the API volume, so the optimizer
 * must fetch them by public URL. Files in /images stay relative and are read
 * from the web public folder.
 */
export function optimizerImageSrc(url: string | null | undefined): string | null {
  const resolved = resolveAssetUrl(url);
  if (!resolved) return null;
  if (resolved.startsWith('/uploads/')) {
    return `${getSiteUrl()}${resolved}`;
  }
  return resolved;
}

export function isOptimizableImageSrc(src: string): boolean {
  if (src.startsWith('/images/') || src.startsWith('/uploads/')) return true;
  try {
    const parsed = new URL(src);
    const host = parsed.hostname.toLowerCase();
    return (
      (host === 'cardon.vn' || host === 'www.cardon.vn') &&
      parsed.pathname.startsWith('/uploads/')
    );
  } catch {
    return false;
  }
}
