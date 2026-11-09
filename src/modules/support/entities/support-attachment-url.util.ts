const SAFE_FILENAME_RE = /^[A-Za-z0-9._-]+$/;

const SUPPORT_ATTACHMENT_PREFIXES = [
  '/uploads/support/',
  '/account/support/files/',
  '/admin/support/files/',
] as const;

function isSafeFilename(filename: string): boolean {
  return (
    Boolean(filename) &&
    !filename.includes('..') &&
    !filename.includes('/') &&
    !filename.includes('\\') &&
    SAFE_FILENAME_RE.test(filename)
  );
}

/**
 * Normalize stored attachment URL to a pathname (no query/hash).
 * Supports relative paths and absolute http(s) URLs.
 */
export function normalizeAttachmentPathname(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return parsed.pathname || null;
    } catch {
      return null;
    }
  }

  // Reject other schemes (javascript:, file:, etc.)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return null;
  }

  const withoutQuery = trimmed.split('?')[0]?.split('#')[0] ?? '';
  if (!withoutQuery) return null;
  return withoutQuery;
}

/**
 * Exact path-segment extraction — never substring match.
 * `/uploads/support/a.png.bak` → `a.png.bak` (not `a.png`).
 */
export function extractExactSupportAttachmentFilename(
  attachmentUrl: string,
): string | null {
  const pathname = normalizeAttachmentPathname(attachmentUrl);
  if (!pathname) return null;

  for (const prefix of SUPPORT_ATTACHMENT_PREFIXES) {
    if (!pathname.startsWith(prefix)) continue;
    const rest = pathname.slice(prefix.length);
    if (!rest || rest.includes('/') || rest.includes('\\')) {
      return null;
    }
    let decoded: string;
    try {
      decoded = decodeURIComponent(rest);
    } catch {
      return null;
    }
    if (!isSafeFilename(decoded)) return null;
    return decoded;
  }

  // Bare filename stored without prefix
  if (!pathname.includes('/') && !pathname.includes('\\') && isSafeFilename(pathname)) {
    return pathname;
  }

  return null;
}

/** True iff the stored URL refers exactly to `{filename}` under an allowed support path. */
export function attachmentUrlMatchesFilename(
  attachmentUrl: string,
  filename: string,
): boolean {
  if (!isSafeFilename(filename)) return false;
  const extracted = extractExactSupportAttachmentFilename(attachmentUrl);
  return extracted !== null && extracted === filename;
}
