import { sanitizeCmsHtml } from '../../cms/entities/cms-html-safety';
import { resolveCmsPublicPath } from '../utils/cms-path.util';
import type {
  ArticleBlock,
  ArticleDocumentV1,
} from '../entities/article-document.types';
import type { ExistingContentItem } from '../entities/generation-context.types';

export function renderArticleDocumentHtml(
  doc: ArticleDocumentV1,
  pageLookup: Map<string, ExistingContentItem>,
): string {
  const parts = doc.sections.map((block) => renderBlock(block, pageLookup));
  return sanitizeCmsHtml(parts.join('\n'));
}

function renderBlock(block: ArticleBlock, pageLookup: Map<string, ExistingContentItem>): string {
  switch (block.type) {
    case 'paragraph':
      return `<p>${escapeHtml(block.text ?? '')}</p>`;
    case 'h2':
      return `<h2>${escapeHtml(block.text ?? '')}</h2>`;
    case 'h3':
      return `<h3>${escapeHtml(block.text ?? '')}</h3>`;
    case 'ul':
      return `<ul>${(block.items ?? []).map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
    case 'ol':
      return `<ol>${(block.items ?? []).map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ol>`;
    case 'blockquote':
      return `<blockquote>${escapeHtml(block.text ?? '')}</blockquote>`;
    case 'callout':
      return `<blockquote>${escapeHtml(block.text ?? '')}</blockquote>`;
    case 'internalLink': {
      const page = block.targetPageId ? pageLookup.get(block.targetPageId) : undefined;
      const href = page
        ? resolveCmsPublicPath(page.type, page.slug, page.categorySlug)
        : '#';
      return `<p><a href="${escapeHtml(href)}">${escapeHtml(block.anchorText ?? block.text ?? '')}</a></p>`;
    }
    case 'faq':
      return (block.faqItems ?? [])
        .map(
          (f) =>
            `<h3>${escapeHtml(f.question)}</h3><p>${escapeHtml(f.answer)}</p>`,
        )
        .join('');
    case 'table': {
      const rows = block.rows ?? [];
      const body = rows
        .map(
          (row, ri) =>
            `<tr>${row.map((cell) => (ri === 0 ? `<th>${escapeHtml(cell)}</th>` : `<td>${escapeHtml(cell)}</td>`)).join('')}</tr>`,
        )
        .join('');
      return `<table>${body}</table>`;
    }
    case 'image':
      return block.url
        ? `<p><img src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt ?? '')}" /></p>`
        : '';
    default:
      return block.text ? `<p>${escapeHtml(block.text)}</p>` : '';
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
