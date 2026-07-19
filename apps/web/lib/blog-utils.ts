import type { PublicBlogPost } from '@/lib/cms-api';

/** Derive list-optimized image paths from a featured image URL (card → thumb → full). */
export function getBlogListImageCandidates(featuredImage: string): string[] {
  const trimmed = featuredImage.trim();
  if (!trimmed) return [];

  const pathMatch = trimmed.match(/(\/uploads\/[^/]+\/)([^/?#]+)/);
  if (!pathMatch) return [trimmed];

  const [, prefix, filename] = pathMatch;
  const base = filename.replace(/\.[^.]+$/, '');
  const card = `${prefix}cards/${base}.webp`;
  const thumb = `${prefix}thumbs/${base}.webp`;

  const origin = trimmed.startsWith('http')
    ? trimmed.slice(0, trimmed.indexOf(pathMatch[1]))
    : '';

  const withOrigin = (path: string) => (origin ? `${origin}${path}` : path);

  const full = withOrigin(`${prefix}${filename}`);
  const candidates = [withOrigin(card), withOrigin(thumb), full];
  return [...new Set(candidates)];
}

export type TocItem = { id: string; text: string; level: 2 | 3 };

/** Demote content H1 to H2 and inject ids into H2/H3 for TOC. */
export function prepareArticleHtml(html: string): { html: string; headings: TocItem[] } {
  const demote = html.replace(/<\/?h1\b/gi, (m) => m.replace(/h1/i, 'h2'));
  const headings: TocItem[] = [];
  let index = 0;

  const processed = demote.replace(/<(h2|h3)([^>]*)>([\s\S]*?)<\/\1>/gi, (match, tag, attrs, inner) => {
    const text = inner.replace(/<[^>]+>/g, '').trim();
    if (!text) return match;

    const level = tag.toLowerCase() === 'h2' ? 2 : 3;
    const existingId = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i);
    const id = existingId?.[1] ?? `section-${++index}`;

    headings.push({ id, text, level: level as 2 | 3 });

    if (existingId) return match;
    const attrPart = attrs.trim();
    return `<${tag}${attrPart ? ` ${attrPart}` : ''} id="${id}">${inner}</${tag}>`;
  });

  return { html: processed, headings };
}

export function pickRelatedPosts(
  post: PublicBlogPost,
  related: PublicBlogPost[],
  allPosts: PublicBlogPost[],
  limit = 4,
): PublicBlogPost[] {
  const seen = new Set<string>([post.id]);
  const result: PublicBlogPost[] = [];

  for (const p of related) {
    if (result.length >= limit) break;
    if (!seen.has(p.id)) {
      seen.add(p.id);
      result.push(p);
    }
  }

  if (result.length < limit && post.categorySlug) {
    for (const p of allPosts) {
      if (result.length >= limit) break;
      if (seen.has(p.id)) continue;
      if (p.categorySlug === post.categorySlug) {
        seen.add(p.id);
        result.push(p);
      }
    }
  }

  for (const p of allPosts) {
    if (result.length >= limit) break;
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    result.push(p);
  }

  return result.slice(0, limit);
}
