import { CmsPageStatus } from '@prisma/client';
import type { ArticleDocumentV1 } from '../entities/article-document.types';
import type { GenerationContext } from '../entities/generation-context.types';
import {
  resolveInternalLinkTarget,
  stripUnresolvedInternalLinks,
} from './internal-link-resolve.util';

function emptyContext(
  overrides: Partial<GenerationContext> = {},
): GenerationContext {
  return {
    plan: {} as GenerationContext['plan'],
    userProvided: {
      topic: 't',
      primaryKeyword: 'k',
      searchIntent: 'INFO',
      contentType: 'GUIDE',
      audience: null,
      businessObjective: null,
      supportingKeywords: [],
      angle: null,
    },
    references: {},
    brandContext: {} as GenerationContext['brandContext'],
    factContext: { refs: [], source: 'BACKEND' },
    existingContent: [],
    internalLinkCandidates: [],
    aiGenerated: {},
    ...overrides,
  };
}

function sampleDoc(links: Array<{ targetPageId: string }>): ArticleDocumentV1 {
  return {
    schemaVersion: '1.0',
    title: 'Test',
    seo: {
      metaTitle: 'Test',
      metaDescription: 'x'.repeat(130),
      focusKeyword: 'k',
    },
    sections: links.map((l, i) => ({
      id: `blk-${i}`,
      type: 'internalLink' as const,
      targetPageId: l.targetPageId,
      anchorText: 'a',
    })),
    factRefs: [],
    internalLinks: links.map((l) => ({
      sectionId: 'blk-0',
      targetPageId: l.targetPageId,
      anchorText: 'a',
      validated: true,
    })),
    qualityFlags: [],
  };
}

describe('internal-link-resolve.util', () => {
  it('resolves validated candidates outside existingContent slice', () => {
    const context = emptyContext({
      existingContent: [
        {
          pageId: 'page-a',
          title: 'A',
          slug: 'a',
          type: 'BLOG_POST',
          status: CmsPageStatus.PUBLISHED,
          categorySlug: null,
          focusKeyword: null,
          publicPath: '/blog/a',
        },
      ],
      internalLinkCandidates: [
        {
          targetPageId: 'page-b',
          anchorText: 'B',
          reason: 'related',
          confidence: 0.8,
          validated: true,
          publicPath: '/blog/b',
        },
      ],
    });

    expect(resolveInternalLinkTarget(context, 'page-b')?.source).toBe('linkCandidate');
    expect(resolveInternalLinkTarget(context, 'page-a')?.source).toBe('existingContent');
    expect(resolveInternalLinkTarget(context, 'missing')).toBeNull();
  });

  it('strips unresolved links and flags LINK_SANITIZED', () => {
    const context = emptyContext({
      internalLinkCandidates: [
        {
          targetPageId: 'ok',
          anchorText: 'OK',
          reason: 'r',
          confidence: 1,
          validated: true,
        },
      ],
    });
    const { doc, droppedPageIds } = stripUnresolvedInternalLinks(
      sampleDoc([{ targetPageId: 'ok' }, { targetPageId: 'gone' }]),
      context,
    );

    expect(droppedPageIds).toEqual(['gone']);
    expect(doc.internalLinks).toHaveLength(1);
    expect(doc.internalLinks[0].targetPageId).toBe('ok');
    expect(doc.sections).toHaveLength(1);
    expect(doc.qualityFlags).toContain('LINK_SANITIZED');
  });
});
