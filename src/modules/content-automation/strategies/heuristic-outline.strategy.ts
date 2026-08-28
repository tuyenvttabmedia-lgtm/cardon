import { Injectable } from '@nestjs/common';
import type { ContentPlan } from '@prisma/client';
import { OUTLINE_VERSION, type OutlineV1 } from '../entities/outline.types';
import type { GenerationContext } from '../entities/generation-context.types';
import { isIntelligenceSnapshotV1 } from '../entities/intelligence-snapshot.types';

@Injectable()
export class HeuristicOutlineStrategy {
  buildOutline(plan: ContentPlan, context: GenerationContext): OutlineV1 {
    const title = plan.suggestedTitle?.trim() || plan.topic.trim();
    const intelligence = isIntelligenceSnapshotV1(plan.intelligenceSnapshot)
      ? plan.intelligenceSnapshot
      : null;

    const sections: OutlineV1['sections'] = [
      {
        id: 'sec-intro',
        heading: 'Giới thiệu',
        level: 2,
        summary: `Giới thiệu chủ đề "${plan.topic}" và từ khóa "${plan.primaryKeyword}".`,
        keyPoints: [plan.primaryKeyword, ...(context.userProvided.supportingKeywords ?? []).slice(0, 3)],
        targetWordCount: 150,
      },
      {
        id: 'sec-main',
        heading: 'Nội dung chính',
        level: 2,
        summary: 'Triển khai nội dung theo search intent và content type.',
        keyPoints: [
          `Intent: ${plan.searchIntent}`,
          `Type: ${plan.contentType}`,
          ...(context.userProvided.angle ? [context.userProvided.angle] : []),
        ],
        targetWordCount: 400,
      },
    ];

    if (intelligence?.internalLinkCandidates?.length) {
      sections.push({
        id: 'sec-links',
        heading: 'Liên kết nội bộ đề xuất',
        level: 2,
        summary: 'Gợi ý liên kết tới bài liên quan đã publish.',
        keyPoints: intelligence.internalLinkCandidates.slice(0, 5).map((l) => l.title),
        targetWordCount: 100,
      });
    }

    sections.push({
      id: 'sec-conclusion',
      heading: 'Kết luận',
      level: 2,
      summary: 'Tóm tắt và CTA phù hợp CardOn.',
      keyPoints: ['Tóm tắt', 'CTA'],
      targetWordCount: 100,
    });

    return {
      version: OUTLINE_VERSION,
      generatedAt: new Date().toISOString(),
      source: 'HEURISTIC',
      title,
      excerpt: `Hướng dẫn về ${plan.primaryKeyword} trên CardOn.vn`,
      sections,
      seoNotes: {
        metaTitleHint: title.slice(0, 60),
        metaDescriptionHint: `${plan.topic} — ${plan.primaryKeyword}`.slice(0, 155),
      },
    };
  }
}
