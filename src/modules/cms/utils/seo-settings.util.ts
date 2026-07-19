/** Normalize Google Search Console verification token from admin input. */
export function normalizeSearchConsoleVerification(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const metaMatch = trimmed.match(/content\s*=\s*["']([^"']+)["']/i);
  if (metaMatch?.[1]) return metaMatch[1].trim();

  return trimmed
    .replace(/^content:\s*/i, '')
    .trim()
    .replace(/^["']|["']$/g, '');
}
