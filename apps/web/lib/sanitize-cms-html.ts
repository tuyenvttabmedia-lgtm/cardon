/** Client-side CMS HTML sanitizer — mirrors src/modules/cms/entities/cms-html-safety.ts */

import { CMS_BLOCK_CLASSES } from './cms-block-snippets';

export const CMS_ALLOWED_HTML_TAGS = new Set([
  'p', 'br', 'strong', 'em', 'b', 'i', 'u', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'a', 'span',
  'div', 'section', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'iframe',
  'pre', 'code', 'hr',
]);

const CMS_ALLOWED_CLASS_SET = new Set<string>(CMS_BLOCK_CLASSES);

const SCRIPT_TAG_RE = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const EVENT_HANDLER_RE = /\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_URL_RE = /\s(href|src)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isUnsafeUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  return (
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('data:text/html') ||
    trimmed.startsWith('vbscript:')
  );
}

function isAllowedEmbedUrl(url: string): boolean {
  const lower = url.trim().toLowerCase();
  return (
    lower.includes('youtube.com/embed') ||
    lower.includes('youtube-nocookie.com/embed') ||
    lower.includes('youtu.be/')
  );
}

function extractAllowedClassAttr(attrs: string): string {
  const classMatch = attrs.match(/\sclass\s*=\s*("([^"]*)"|'([^']*)')/i);
  if (!classMatch) return '';
  const raw = classMatch[2] ?? classMatch[3] ?? '';
  const allowed = raw
    .split(/\s+/)
    .map((c) => c.trim())
    .filter((c) => c && CMS_ALLOWED_CLASS_SET.has(c));
  if (!allowed.length) return '';
  return ` class="${allowed.join(' ')}"`;
}

function sanitizeAnchorTag(attrs: string): string {
  const hrefMatch = attrs.match(/\shref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const classAttr = extractAllowedClassAttr(attrs);
  if (!hrefMatch) return `<a${classAttr}>`;
  const href = hrefMatch[2] ?? hrefMatch[3] ?? hrefMatch[4] ?? '';
  if (isUnsafeUrl(href)) return `<a${classAttr} href="#">`;
  return `<a href="${escapeHtmlAttr(href)}"${classAttr}>`;
}

function sanitizeImgTag(attrs: string): string {
  const srcMatch = attrs.match(/\ssrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
  if (!srcMatch) return '';
  const src = srcMatch[2] ?? srcMatch[3] ?? srcMatch[4] ?? '';
  if (isUnsafeUrl(src)) return '';
  const altMatch = attrs.match(/\salt\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const alt = altMatch ? (altMatch[2] ?? altMatch[3] ?? altMatch[4] ?? '') : '';
  return `<img src="${escapeHtmlAttr(src)}" alt="${escapeHtmlAttr(alt)}">`;
}

function sanitizeIframeTag(attrs: string): string {
  const srcMatch = attrs.match(/\ssrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
  if (!srcMatch) return '';
  const src = srcMatch[2] ?? srcMatch[3] ?? srcMatch[4] ?? '';
  if (isUnsafeUrl(src) || !isAllowedEmbedUrl(src)) return '';
  return `<iframe src="${escapeHtmlAttr(src)}" allowfullscreen loading="lazy"></iframe>`;
}

function extractSafeIdAttr(attrs: string): string {
  const idMatch = attrs.match(/\bid\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
  if (!idMatch) return '';
  const id = (idMatch[2] ?? idMatch[3] ?? idMatch[4] ?? '').trim();
  if (!/^[a-zA-Z][\w-]*$/.test(id)) return '';
  return ` id="${escapeHtmlAttr(id)}"`;
}

function sanitizeHeadingTag(tag: string, attrs: string): string {
  return `<${tag}${extractSafeIdAttr(attrs)}>`;
}

function sanitizeGenericOpenTag(tag: string, attrs: string): string {
  const classAttr = extractAllowedClassAttr(attrs);
  return `<${tag}${classAttr}>`;
}

export function sanitizeCmsHtml(html: string): string {
  if (!html) return '';

  let out = html.replace(SCRIPT_TAG_RE, '').replace(EVENT_HANDLER_RE, '');

  out = out.replace(JS_URL_RE, (match, attr, _q, dbl, sgl, bare) => {
    const url = dbl ?? sgl ?? bare ?? '';
    return isUnsafeUrl(url) ? ` ${attr}="#"` : match;
  });

  out = out.replace(TAG_RE, (match, rawTag, attrs) => {
    const tag = rawTag.toLowerCase();
    if (!CMS_ALLOWED_HTML_TAGS.has(tag)) return '';
    if (match.startsWith('</')) {
      if (tag === 'iframe' || tag === 'img' || tag === 'br' || tag === 'hr') return '';
      return `</${tag}>`;
    }
    if (tag === 'br') return '<br>';
    if (tag === 'hr') return '<hr>';
    if (tag === 'a') return sanitizeAnchorTag(attrs);
    if (tag === 'img') return sanitizeImgTag(attrs);
    if (tag === 'iframe') return sanitizeIframeTag(attrs);
    if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
      return sanitizeHeadingTag(tag, attrs);
    }
    if (tag === 'div' || tag === 'span' || tag === 'p' || tag === 'section') {
      return sanitizeGenericOpenTag(tag, attrs);
    }
    return `<${tag}>`;
  });

  return out;
}
