import { CmsPageStatus } from '@prisma/client';
import type { ArticleDocumentV1 } from '../entities/article-document.types';
import type { GenerationContext } from '../entities/generation-context.types';

export type ResolvedInternalLinkTarget = {
  pageId: string;
  title: string;
  status: string;
  type: string;
  source: 'existingContent' | 'linkCandidate';
};

/** True if pageId is in existingContent or a validated internalLinkCandidate. */
export function isResolvableInternalLinkTarget(
  context: GenerationContext,
  pageId: string,
): boolean {
  return resolveInternalLinkTarget(context, pageId) != null;
}

/**
 * Resolve an internal link target for quality checks.
 * Candidates may include pages outside the top-N existingContent slice.
 */
export function resolveInternalLinkTarget(
  context: GenerationContext,
  pageId: string,
): ResolvedInternalLinkTarget | null {
  const fromExisting = context.existingContent.find((c) => c.pageId === pageId);
  if (fromExisting) {
    return {
      pageId: fromExisting.pageId,
      title: fromExisting.title,
      status: fromExisting.status,
      type: fromExisting.type,
      source: 'existingContent',
    };
  }

  const candidate = context.internalLinkCandidates.find(
    (c) => c.validated && c.targetPageId === pageId,
  );
  if (candidate) {
    return {
      pageId: candidate.targetPageId,
      title: candidate.anchorText,
      status: CmsPageStatus.PUBLISHED,
      type: 'BLOG_POST',
      source: 'linkCandidate',
    };
  }

  return null;
}

/**
 * Drop internal links (array + blocks) that cannot be resolved from context.
 * Prevents hard LINK_EXISTS failures when AI/heuristic picks a valid candidate
 * outside the existingContent slice, or stale IDs slip through.
 */
export function stripUnresolvedInternalLinks(
  doc: ArticleDocumentV1,
  context: GenerationContext,
): { doc: ArticleDocumentV1; droppedPageIds: string[] } {
  const dropped = new Set<string>();

  const internalLinks = doc.internalLinks.filter((link) => {
    if (isResolvableInternalLinkTarget(context, link.targetPageId)) return true;
    dropped.add(link.targetPageId);
    return false;
  });

  const sections = doc.sections.filter((block) => {
    if (block.type !== 'internalLink') return true;
    const target = block.targetPageId?.trim();
    if (target && isResolvableInternalLinkTarget(context, target)) return true;
    if (target) dropped.add(target);
    return false;
  });

  if (dropped.size === 0) {
    return { doc, droppedPageIds: [] };
  }

  const qualityFlags = [...doc.qualityFlags];
  if (!qualityFlags.includes('LINK_SANITIZED')) {
    qualityFlags.push('LINK_SANITIZED');
  }

  return {
    doc: {
      ...doc,
      sections,
      internalLinks,
      qualityFlags,
    },
    droppedPageIds: [...dropped],
  };
}
