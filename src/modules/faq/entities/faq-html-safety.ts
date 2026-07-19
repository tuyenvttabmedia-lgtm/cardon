import { sanitizeCmsHtml } from '../../cms/entities/cms-html-safety';

/** FAQ answers allow a strict subset of CMS HTML tags. */
export const FAQ_ALLOWED_HTML_TAGS = new Set([
  'p',
  'br',
  'strong',
  'em',
  'b',
  'i',
  'ul',
  'ol',
  'li',
  'a',
]);

export function sanitizeFaqHtml(html: string): string {
  if (!html) return '';
  const stripped = html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, rawTag) => {
    const tag = rawTag.toLowerCase();
    if (!FAQ_ALLOWED_HTML_TAGS.has(tag)) return '';
    return match;
  });
  return sanitizeCmsHtml(stripped);
}

export function plainTextFromHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function wrapPlainAnswer(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return trimmed;
  return `<p>${trimmed.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
}
