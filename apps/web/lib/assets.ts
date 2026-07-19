import { getApiBaseUrl } from '@/lib/utils';

/** Resolve CMS/media paths (e.g. /uploads/...) to absolute URLs for img src. */
export function resolveAssetUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  const base = getApiBaseUrl().replace(/\/api\/v1$/, '');
  return `${base}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;
}
