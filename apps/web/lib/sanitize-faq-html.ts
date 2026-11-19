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

/** Browsers ignore ASCII control chars/whitespace inside a URL scheme (`java\tscript:`). */
// eslint-disable-next-line no-control-regex
const URL_IGNORED_CHARS_RE = /[\u0000-\u0020\u007f-\u009f\u00ad\u200b-\u200f\u2028\u2029\u2060\ufeff]/g;
const SAFE_DATA_IMAGE_RE = /^data:image\/(?:png|jpe?g|gif|webp|avif)[;,]/;

function decodeUrlEntities(value: string): string {
  const fromCode = (code: number) =>
    Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  return value
    .replace(/&#x0*([0-9a-f]+);?/gi, (_m, hex: string) => fromCode(parseInt(hex, 16)))
    .replace(/&#0*(\d+);?/g, (_m, dec: string) => fromCode(parseInt(dec, 10)))
    .replace(/&colon;/gi, ':')
    .replace(/&(?:tab|newline);/gi, '');
}

function isUnsafeUrl(url: string): boolean {
  const normalized = decodeUrlEntities(url).replace(URL_IGNORED_CHARS_RE, '').toLowerCase();
  if (normalized.startsWith('javascript:') || normalized.startsWith('vbscript:')) return true;
  if (normalized.startsWith('data:')) return !SAFE_DATA_IMAGE_RE.test(normalized);
  return false;
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
