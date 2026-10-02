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
