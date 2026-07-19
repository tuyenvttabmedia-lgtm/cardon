import fs from 'fs';

const api = JSON.parse(fs.readFileSync('C:/Users/MyHome/blog-post.json', 'utf8'));
let content = api.data.post.content;

const demote = content.replace(/<\/?h1\b/gi, (m) => m.replace(/h1/i, 'h2'));
const headings = [];
let index = 0;
content = demote.replace(/<(h2|h3)([^>]*)>([\s\S]*?)<\/\1>/gi, (match, tag, attrs, inner) => {
  const text = inner.replace(/<[^>]+>/g, '').trim();
  if (!text) return match;
  const existingId = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i);
  const id = existingId?.[1] ?? `section-${++index}`;
  headings.push({ id, text, level: tag.toLowerCase() === 'h2' ? 2 : 3 });
  if (existingId) return match;
  const attrPart = attrs.trim();
  return `<${tag}${attrPart ? ` ${attrPart}` : ''} id="${id}">${inner}</${tag}>`;
});

const CMS_ALLOWED_HTML_TAGS = new Set([
  'p', 'br', 'strong', 'em', 'b', 'i', 'u', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'a', 'span',
  'div', 'section', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'iframe', 'pre', 'code', 'hr',
]);
const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;

let out = content.replace(TAG_RE, (match, rawTag, attrs) => {
  const tag = rawTag.toLowerCase();
  if (!CMS_ALLOWED_HTML_TAGS.has(tag)) return '';
  if (match.startsWith('</')) {
    if (tag === 'iframe' || tag === 'img' || tag === 'br' || tag === 'hr') return '';
    return `</${tag}>`;
  }
  if (tag === 'br') return '<br>';
  if (tag === 'hr') return '<hr>';
  if (['h1','h2','h3','h4','h5','h6'].includes(tag)) {
    const idMatch = attrs.match(/\bid\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const id = idMatch ? (idMatch[2] ?? idMatch[3] ?? idMatch[4] ?? '').trim() : '';
    const safeId = /^[a-zA-Z][\w-]*$/.test(id) ? ` id="${id}"` : '';
    return `<${tag}${safeId}>`;
  }
  return `<${tag}>`;
});

const pos = out.indexOf('<hr>');
console.log('headings', headings.length);
console.log('h2 after sanitize', (out.match(/<h2/gi) || []).length);
console.log('sample', out.slice(pos, pos + 150));
