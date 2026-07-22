/** Accepts a raw embed URL or a full `<iframe …>` snippet from Google Maps. */
export function extractGoogleMapsEmbedUrl(input: string | null | undefined): string | null {
  const trimmed = (input ?? '').trim();
  if (!trimmed) return null;

  const srcMatch = trimmed.match(/\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const candidate = (srcMatch?.[2] ?? srcMatch?.[3] ?? srcMatch?.[4] ?? trimmed).trim();

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:') return null;
    const host = parsed.hostname.toLowerCase();
    const hostOk =
      host === 'www.google.com' ||
      host === 'google.com' ||
      host === 'maps.google.com' ||
      host === 'maps.google.com.vn' ||
      host === 'www.google.com.vn' ||
      host.endsWith('.google.com') ||
      host.endsWith('.google.com.vn');
    if (!hostOk) return null;
    const path = parsed.pathname.toLowerCase();
    if (path.includes('/maps/embed') || parsed.searchParams.get('output') === 'embed') {
      return candidate;
    }
    return null;
  } catch {
    return null;
  }
}
