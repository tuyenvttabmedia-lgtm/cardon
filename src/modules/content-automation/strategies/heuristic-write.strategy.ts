import { Injectable } from '@nestjs/common';
import type { ContentPlan } from '@prisma/client';
import {
  ARTICLE_DOCUMENT_SCHEMA_VERSION,
  type ArticleBlock,
  type ArticleDocumentV1,
} from '../entities/article-document.types';
import type { GenerationContext } from '../entities/generation-context.types';
import { isOutlineV1 } from '../entities/outline.types';

@Injectable()
export class HeuristicWriteStrategy {
  buildArticle(plan: ContentPlan, context: GenerationContext): ArticleDocumentV1 {
    const outline = isOutlineV1(plan.outline) ? plan.outline : null;
    const title = outline?.title ?? plan.suggestedTitle ?? plan.topic;
    const keyword = plan.primaryKeyword;

    const sections: ArticleBlock[] = [
      {
        id: 'blk-intro',
        type: 'paragraph',
        text: `${title}. Bài viết hướng dẫn về "${keyword}" dành cho ${plan.audience ?? 'người dùng CardOn'}.`,
      },
    ];

    for (const sec of outline?.sections ?? []) {
      sections.push({
        id: `blk-${sec.id}`,
        type: sec.level === 3 ? 'h3' : 'h2',
        text: sec.heading,
      });
      sections.push({
        id: `blk-${sec.id}-p`,
        type: 'paragraph',
        text: `${sec.summary} ${sec.keyPoints.join('. ')}.`,
      });
    }

    const internalLinks = context.internalLinkCandidates
      .filter((c) => c.validated)
      .slice(0, 3)
      .map((c, i) => ({
        sectionId: sections[0]?.id ?? 'blk-intro',
        targetPageId: c.targetPageId,
        anchorText: c.anchorText,
        validated: true,
      }));

    for (const link of internalLinks) {
      sections.push({
        id: `blk-link-${link.targetPageId}`,
        type: 'internalLink',
        targetPageId: link.targetPageId,
        anchorText: link.anchorText,
      });
    }

    return {
      schemaVersion: ARTICLE_DOCUMENT_SCHEMA_VERSION,
      title,
      excerpt: outline?.excerpt ?? `${keyword} — CardOn.vn`,
      seo: {
        metaTitle: (outline?.seoNotes?.metaTitleHint ?? title).slice(0, 128),
        metaDescription: (
          outline?.seoNotes?.metaDescriptionHint ??
          `${title} — hướng dẫn ${keyword}`
        ).slice(0, 256),
        focusKeyword: keyword,
        robots: 'index,follow',
      },
      sections,
      factRefs: context.factContext.refs.map((r, i) => ({
        refId: `fact-${i + 1}`,
        type: r.type,
        sourceId: r.sourceId,
      })),
      internalLinks,
      qualityFlags: [],
      source: 'HEURISTIC',
      generatedAt: new Date().toISOString(),
    };
  }
}
