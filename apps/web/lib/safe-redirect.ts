/**
 * Allow only same-origin relative paths for post-login redirects.
 * Rejects open-redirect / protocol-relative / encoded tricks.
 */
export function safeInternalPath(
  raw: string | null | undefined,
  fallback: string,
): string {
  if (raw == null || typeof raw !== 'string') return fallback;
  const value = raw.trim();
  if (!value) return fallback;

  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return fallback;
  }
  if (value.includes('\\') || value.includes('\0')) {
    return fallback;
  }

  let decoded = value;
  try {
    for (let i = 0; i < 3; i++) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    return fallback;
  }

  const lower = decoded.toLowerCase();
  if (
    !decoded.startsWith('/') ||
    decoded.startsWith('//') ||
    decoded.includes('\\') ||
    decoded.includes('\0') ||
    lower.includes('://') ||
    lower.startsWith('http:') ||
    lower.startsWith('https:') ||
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:')
  ) {
    return fallback;
  }

  return value;
}
