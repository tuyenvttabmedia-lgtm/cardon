export const ARTICLE_DOCUMENT_SCHEMA_VERSION = '1.0' as const;

export type ArticleBlockType =
  | 'paragraph'
  | 'h2'
  | 'h3'
  | 'ul'
  | 'ol'
  | 'blockquote'
  | 'table'
  | 'image'
  | 'internalLink'
  | 'faq'
  | 'callout';

export interface ArticleBlock {
  id: string;
  type: ArticleBlockType;
  text?: string;
  items?: string[];
  rows?: string[][];
  url?: string;
  alt?: string;
  targetPageId?: string;
  anchorText?: string;
  faqItems?: Array<{ question: string; answer: string }>;
  variant?: string;
}

export interface ArticleDocumentSeo {
  metaTitle: string;
  metaDescription: string;
  focusKeyword: string;
  canonicalUrl?: string;
  robots?: string;
}

export interface ArticleDocumentInternalLink {
  sectionId: string;
  targetPageId: string;
  anchorText: string;
  validated: boolean;
}

export interface ArticleDocumentFactRef {
  refId: string;
  type: string;
  sourceId: string;
}

export interface ArticleDocumentV1 {
  schemaVersion: typeof ARTICLE_DOCUMENT_SCHEMA_VERSION;
  title: string;
  excerpt?: string;
  seo: ArticleDocumentSeo;
  sections: ArticleBlock[];
  factRefs: ArticleDocumentFactRef[];
  internalLinks: ArticleDocumentInternalLink[];
  qualityFlags: string[];
  source?: 'AI' | 'HEURISTIC';
  generatedAt?: string;
}

export function isArticleDocumentV1(raw: unknown): raw is ArticleDocumentV1 {
  return (
    !!raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    (raw as ArticleDocumentV1).schemaVersion === ARTICLE_DOCUMENT_SCHEMA_VERSION
  );
}
