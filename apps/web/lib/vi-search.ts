/** Lowercase + strip Vietnamese diacritics for accent/case-insensitive search. */
export function normalizeViSearch(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLocaleLowerCase('en-US')
    .trim();
}

export function stripHtmlForSearch(html: string | null | undefined): string {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Accent + case insensitive match.
 * Query tokens (whitespace-separated) must all appear in the combined haystack.
 * "Viettel" / "viettel" / "VIETTEL" and "nạp thẻ" / "nap the" all match.
 */
export function matchesViSearch(
  query: string,
  ...haystacks: Array<string | null | undefined>
): boolean {
  const normalizedQuery = normalizeViSearch(query);
  if (!normalizedQuery) return true;

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  const haystack = haystacks
    .filter((value): value is string => Boolean(value))
    .map((value) => normalizeViSearch(value))
    .join(' ');

  return tokens.every((token) => haystack.includes(token));
}
