import type { GenerationContext } from '../entities/generation-context.types';
import {
  ARTICLE_DOCUMENT_SCHEMA_VERSION,
  type ArticleBlock,
  type ArticleBlockType,
  type ArticleDocumentV1,
} from '../entities/article-document.types';
import { coerceArticleDocument } from './article-document.normalize';

const VALID_BLOCK_TYPES = new Set<ArticleBlockType>([
  'paragraph',
  'h2',
  'h3',
  'ul',
  'ol',
  'blockquote',
  'table',
  'image',
  'internalLink',
  'faq',
  'callout',
]);

export class ArticleDocumentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArticleDocumentValidationError';
  }
}

export function validateAndBuildArticleDocument(
  raw: unknown,
  context: GenerationContext,
  source: 'AI' | 'HEURISTIC',
): ArticleDocumentV1 {
  validateNoHref(raw);
  const coerced = coerceArticleDocument(raw);
  const doc = parseDocument(coerced, context);

  return {
    ...doc,
    schemaVersion: ARTICLE_DOCUMENT_SCHEMA_VERSION,
    source,
    generatedAt: new Date().toISOString(),
  };
}

export function validateArticleDocumentLayer1(doc: ArticleDocumentV1): void {
  if (!doc.title?.trim()) {
    throw new ArticleDocumentValidationError('title is required');
  }
  if (!doc.seo?.metaTitle?.trim() || !doc.seo.metaDescription?.trim()) {
    throw new ArticleDocumentValidationError('seo metaTitle and metaDescription are required');
  }
  if (!doc.sections?.length) {
    throw new ArticleDocumentValidationError('sections must not be empty');
  }
  for (const block of doc.sections) {
    if (!VALID_BLOCK_TYPES.has(block.type)) {
      throw new ArticleDocumentValidationError(`Invalid block type: ${block.type}`);
    }
  }
}

function parseDocument(raw: unknown, context: GenerationContext): ArticleDocumentV1 {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ArticleDocumentValidationError('Article output must be a JSON object');
  }

  const obj = raw as Record<string, unknown>;
  const allowedPageIds = buildAllowedPageIds(context);

  const title = requireString(obj.title, 'title');
  const seoRaw = obj.seo;
  if (!seoRaw || typeof seoRaw !== 'object') {
    throw new ArticleDocumentValidationError('seo object is required');
  }
  const seoObj = seoRaw as Record<string, unknown>;

  const sections = Array.isArray(obj.sections)
    ? obj.sections.map((s, i) => parseBlock(s, i, allowedPageIds))
    : [];

  const internalLinks = Array.isArray(obj.internalLinks)
    ? obj.internalLinks.map((l, i) => parseInternalLink(l, i, allowedPageIds))
    : [];

  const factRefs = Array.isArray(obj.factRefs)
    ? obj.factRefs.map((f, i) => parseFactRef(f, i, context))
    : [];

  const qualityFlags = Array.isArray(obj.qualityFlags)
    ? obj.qualityFlags.filter((f): f is string => typeof f === 'string')
    : [];

  return {
    schemaVersion: ARTICLE_DOCUMENT_SCHEMA_VERSION,
    title,
    excerpt: optionalString(obj.excerpt),
    seo: {
      metaTitle: requireString(seoObj.metaTitle, 'seo.metaTitle'),
      metaDescription: requireString(seoObj.metaDescription, 'seo.metaDescription'),
      focusKeyword: requireString(seoObj.focusKeyword, 'seo.focusKeyword'),
      canonicalUrl: optionalString(seoObj.canonicalUrl),
      robots: optionalString(seoObj.robots) ?? 'index,follow',
    },
    sections,
    factRefs,
    internalLinks,
    qualityFlags,
  };
}

function parseBlock(item: unknown, index: number, allowedPageIds: Set<string>): ArticleBlock {
  if (!item || typeof item !== 'object') {
    throw new ArticleDocumentValidationError(`Invalid block at index ${index}`);
  }
  const row = item as Record<string, unknown>;
  const type = requireString(row.type, `sections[${index}].type`) as ArticleBlockType;

  if (!VALID_BLOCK_TYPES.has(type)) {
    throw new ArticleDocumentValidationError(
      `Invalid block type: ${type} (allowed: paragraph,h2,h3,ul,ol,blockquote,table,image,internalLink,faq,callout)`,
    );
  }

  const block: ArticleBlock = {
    id:
      typeof row.id === 'string' && row.id.trim()
        ? row.id.trim()
        : `blk-${index + 1}`,
    type,
  };

  if (row.text !== undefined) block.text = requireString(row.text, `sections[${index}].text`);
  if (Array.isArray(row.items)) {
    block.items = row.items.filter((i): i is string => typeof i === 'string');
  }
  if (type === 'internalLink') {
    const pageId = requireString(row.targetPageId, `sections[${index}].targetPageId`);
    if (!allowedPageIds.has(pageId)) {
      throw new ArticleDocumentValidationError(
        `internalLink targetPageId not in allowed context: ${pageId}`,
      );
    }
    block.targetPageId = pageId;
    block.anchorText = requireString(row.anchorText, `sections[${index}].anchorText`);
  }
  if (type === 'faq' && Array.isArray(row.faqItems)) {
    block.faqItems = row.faqItems.map((f, fi) => {
      if (!f || typeof f !== 'object') {
        throw new ArticleDocumentValidationError(`Invalid faq item ${fi}`);
      }
      const faq = f as Record<string, unknown>;
      return {
        question: requireString(faq.question, `faq[${fi}].question`),
        answer: requireString(faq.answer, `faq[${fi}].answer`),
      };
    });
  }

  return block;
}

function parseInternalLink(item: unknown, index: number, allowed: Set<string>) {
  if (!item || typeof item !== 'object') {
    throw new ArticleDocumentValidationError(`Invalid internalLink at ${index}`);
  }
  const row = item as Record<string, unknown>;
  const pageId = requireString(row.targetPageId, `internalLinks[${index}].targetPageId`);
  if (!allowed.has(pageId)) {
    throw new ArticleDocumentValidationError(`internalLink pageId not allowed: ${pageId}`);
  }
  return {
    sectionId: requireString(row.sectionId, `internalLinks[${index}].sectionId`),
    targetPageId: pageId,
    anchorText: requireString(row.anchorText, `internalLinks[${index}].anchorText`),
    validated: row.validated === true,
  };
}

function parseFactRef(item: unknown, index: number, context: GenerationContext) {
  if (!item || typeof item !== 'object') {
    throw new ArticleDocumentValidationError(`Invalid factRef at ${index}`);
  }
  const row = item as Record<string, unknown>;
  const sourceId = requireString(row.sourceId, `factRefs[${index}].sourceId`);
  const allowed = new Set(context.factContext.refs.map((r) => r.sourceId));
  if (!allowed.has(sourceId)) {
    throw new ArticleDocumentValidationError(`factRef sourceId not in context: ${sourceId}`);
  }
  return {
    refId: requireString(row.refId, `factRefs[${index}].refId`),
    type: requireString(row.type, `factRefs[${index}].type`),
    sourceId,
  };
}

function buildAllowedPageIds(context: GenerationContext): Set<string> {
  const ids = new Set<string>();
  for (const item of context.existingContent) ids.add(item.pageId);
  for (const link of context.internalLinkCandidates) {
    if (link.validated) ids.add(link.targetPageId);
  }
  return ids;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ArticleDocumentValidationError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function validateNoHref(raw: unknown): void {
  const json = JSON.stringify(raw);
  if (/href\s*[:=]/i.test(json) || /https?:\/\//i.test(json)) {
    throw new ArticleDocumentValidationError('Article output must not contain href or URLs');
  }
}
