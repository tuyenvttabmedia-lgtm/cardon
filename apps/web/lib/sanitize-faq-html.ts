/** FAQ HTML sanitizer — strict subset for public render. */
const FAQ_ALLOWED = new Set(['p', 'br', 'strong', 'em', 'b', 'i', 'ul', 'ol', 'li', 'a']);

const SCRIPT_TAG_RE = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const EVENT_HANDLER_RE = /\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isUnsafeUrl(url: string): boolean {
  const t = url.trim().toLowerCase();
  return t.startsWith('javascript:') || t.startsWith('data:text/html') || t.startsWith('vbscript:');
}

function sanitizeAnchor(attrs: string): string {
  const hrefMatch = attrs.match(/\shref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
  if (!hrefMatch) return '<a>';
  const href = hrefMatch[2] ?? hrefMatch[3] ?? hrefMatch[4] ?? '';
  if (isUnsafeUrl(href)) return '<a>';
  return `<a href="${escapeHtmlAttr(href)}" rel="noopener noreferrer">`;
}

export function sanitizeFaqHtml(html: string): string {
  if (!html) return '';
  let out = html.replace(SCRIPT_TAG_RE, '').replace(EVENT_HANDLER_RE, '');
  out = out.replace(TAG_RE, (match, rawTag, attrs) => {
    const tag = rawTag.toLowerCase();
    if (!FAQ_ALLOWED.has(tag)) return '';
    if (match.startsWith('</')) {
      if (tag === 'br') return '';
      return `</${tag}>`;
    }
    if (tag === 'br') return '<br>';
    if (tag === 'a') return sanitizeAnchor(attrs);
    return `<${tag}>`;
  });
  return out;
}

export function plainTextFromFaqHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
