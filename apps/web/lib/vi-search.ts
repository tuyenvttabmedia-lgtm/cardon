/** Lowercase + strip Vietnamese diacritics for accent-insensitive search. */
export function normalizeViSearch(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export function stripHtmlForSearch(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function matchesViSearch(
  query: string,
  ...haystacks: Array<string | null | undefined>
): boolean {
  const normalizedQuery = normalizeViSearch(query);
  if (!normalizedQuery) return true;
  return haystacks.some((value) => {
    if (!value) return false;
    return normalizeViSearch(value).includes(normalizedQuery);
  });
}
