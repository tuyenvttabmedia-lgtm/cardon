/** Google Maps embed helpers for contact page (theme-configured, not CMS HTML). */

const GOOGLE_MAP_HOSTS = new Set([
  'www.google.com',
  'google.com',
  'maps.google.com',
  'maps.google.com.vn',
  'www.google.com.vn',
]);

export function isGoogleMapsEmbedUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (!GOOGLE_MAP_HOSTS.has(host) && !host.endsWith('.google.com') && !host.endsWith('.google.com.vn')) {
      return false;
    }
    const path = parsed.pathname.toLowerCase();
    if (path.includes('/maps/embed')) return true;
    if (parsed.searchParams.get('output') === 'embed') return true;
    return false;
  } catch {
    return false;
  }
}

/** Accepts a raw embed URL or a full `<iframe …>` snippet from Google Maps → Share → Embed. */
export function extractGoogleMapsEmbedUrl(input: string | null | undefined): string | null {
  const trimmed = (input ?? '').trim();
  if (!trimmed) return null;

  const srcMatch = trimmed.match(/\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const candidate = (srcMatch?.[2] ?? srcMatch?.[3] ?? srcMatch?.[4] ?? trimmed).trim();
  if (!isGoogleMapsEmbedUrl(candidate)) return null;
  return candidate;
}
