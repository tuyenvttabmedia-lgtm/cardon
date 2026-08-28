import { Injectable } from '@nestjs/common';
import { ContentPlanAction, ContentPlanStatus } from '@prisma/client';
import type { ContentPlan } from '@prisma/client';
import {
  INTELLIGENCE_SNAPSHOT_VERSION,
  type IntelligenceSnapshotV1,
} from '../entities/intelligence-snapshot.types';
import type { GenerationContext } from '../entities/generation-context.types';

@Injectable()
export class HeuristicAnalyzeStrategy {
  buildSnapshot(context: GenerationContext): IntelligenceSnapshotV1 {
    const { plan, userProvided, existingContent } = context;
    const primary = plan.primaryKeyword.trim().toLowerCase();

    const relatedContent = existingContent.map((item) => ({
      pageId: item.pageId,
      title: item.title,
      similarityScore: this.existingContentScore(item, primary),
      reason: 'Khớp từ khóa / tiêu đề / SEO focus keyword (heuristic M2)',
    }));

    const cannibalMatches = relatedContent
      .filter((row) => row.similarityScore >= 0.7)
      .map((row) => {
        const item = existingContent.find((c) => c.pageId === row.pageId);
        return {
          pageId: row.pageId,
          title: row.title,
          focusKeyword: item?.focusKeyword ?? null,
          score: row.similarityScore,
        };
      });

    const cannibalizationRisk =
      cannibalMatches.length >= 2 ? 'HIGH' : cannibalMatches.length === 1 ? 'LOW' : 'NONE';

    const recommendations = this.buildRecommendations(
      plan.action,
      cannibalizationRisk,
      cannibalMatches[0]?.pageId ?? null,
    );

    const internalLinkCandidates = context.internalLinkCandidates
      .filter((c) => c.validated)
      .slice(0, 20)
      .map((c) => ({
        pageId: c.targetPageId,
        title: c.anchorText,
        relevanceScore: c.confidence,
      }));

    const systemSupporting = this.extractSupportingKeywords(existingContent, primary);

    return {
      version: INTELLIGENCE_SNAPSHOT_VERSION,
      analyzedAt: new Date().toISOString(),
      source: 'HEURISTIC',
      input: {
        topic: userProvided.topic,
        primaryKeyword: userProvided.primaryKeyword,
        supportingKeywords: [
          ...new Set([...(userProvided.supportingKeywords ?? []), ...systemSupporting]),
        ].slice(0, 10),
        angle: userProvided.angle ?? undefined,
      },
      relatedContent,
      cannibalization: {
        risk: cannibalizationRisk,
        matches: cannibalMatches,
      },
      recommendations,
      internalLinkCandidates,
    };
  }

  suggestTitle(plan: ContentPlan): string {
    const base = plan.topic.trim();
    if (plan.contentType === 'GUIDE') return `Hướng dẫn: ${base}`;
    if (plan.contentType === 'FAQ') return `FAQ: ${base}`;
    return base.slice(0, 255);
  }

  private existingContentScore(
    item: GenerationContext['existingContent'][number],
    primary: string,
  ): number {
    const haystack = [item.title, item.slug, item.focusKeyword ?? ''].join(' ').toLowerCase();
    if (haystack.includes(primary)) return 1;
    const tokens = primary.split(/\s+/).filter((t) => t.length >= 2);
    const hits = tokens.filter((t) => haystack.includes(t)).length;
    return tokens.length ? hits / tokens.length : 0;
  }

  private extractSupportingKeywords(
    items: GenerationContext['existingContent'],
    primary: string,
  ): string[] {
    const keywords = new Set<string>();
    for (const item of items) {
      if (item.focusKeyword && item.focusKeyword.toLowerCase() !== primary) {
        keywords.add(item.focusKeyword);
      }
      for (const token of item.title.split(/\s+/)) {
        const t = token.toLowerCase().replace(/[^a-z0-9à-ỹ]/gi, '');
        if (t.length >= 4 && t !== primary && !primary.includes(t)) {
          keywords.add(t);
        }
      }
    }
    return [...keywords].slice(0, 5);
  }

  private buildRecommendations(
    currentAction: ContentPlanAction,
    risk: 'NONE' | 'LOW' | 'HIGH',
    topMatchPageId: string | null,
  ): IntelligenceSnapshotV1['recommendations'] {
    if (risk === 'HIGH' && topMatchPageId) {
      return [
        {
          action: ContentPlanAction.UPDATE,
          pageId: topMatchPageId,
          confidence: 0.75,
          reason: 'Phát hiện nội dung trùng chủ đề — đề xuất cập nhật (MVP: recommendation only)',
        },
        {
          action: ContentPlanAction.IGNORE,
          pageId: topMatchPageId,
          confidence: 0.6,
          reason: 'Cannibalization risk cao — cân nhắc bỏ qua kế hoạch mới',
        },
      ];
    }

    if (risk === 'LOW' && topMatchPageId) {
      return [
        {
          action: ContentPlanAction.CREATE,
          pageId: null,
          confidence: 0.65,
          reason: 'Có bài liên quan nhưng vẫn có thể tạo nội dung mới với góc khác',
        },
        {
          action: ContentPlanAction.UPDATE,
          pageId: topMatchPageId,
          confidence: 0.5,
          reason: 'Đề xuất bổ sung bài hiện có (MVP: recommendation only)',
        },
      ];
    }

    return [
      {
        action:
          currentAction === ContentPlanAction.IGNORE
            ? ContentPlanAction.IGNORE
            : ContentPlanAction.CREATE,
        pageId: null,
        confidence: 0.85,
        reason: 'Không phát hiện cannibalization đáng kể — phù hợp tạo nội dung mới',
      },
    ];
  }
}
