import type { ContentPlanAction } from '@prisma/client';

/** Master Spec v1.0 Appendix A — Intelligence Snapshot v1. */
export const INTELLIGENCE_SNAPSHOT_VERSION = '1' as const;

export interface IntelligenceRelatedContent {
  pageId: string;
  title: string;
  similarityScore: number;
  reason: string;
}

export interface IntelligenceCannibalizationMatch {
  pageId: string;
  title: string;
  focusKeyword: string | null;
  score: number;
}

export interface IntelligenceCannibalization {
  risk: 'NONE' | 'LOW' | 'HIGH';
  matches: IntelligenceCannibalizationMatch[];
}

export interface IntelligenceRecommendation {
  action: ContentPlanAction;
  pageId: string | null;
  confidence: number;
  reason: string;
}

export interface IntelligenceLinkCandidateSummary {
  pageId: string;
  title: string;
  relevanceScore: number;
}

export interface IntelligenceSnapshotV1 {
  version: typeof INTELLIGENCE_SNAPSHOT_VERSION;
  analyzedAt: string;
  source: 'HEURISTIC' | 'AI';
  input: {
    topic: string;
    primaryKeyword: string;
    supportingKeywords?: string[];
    angle?: string;
  };
  relatedContent: IntelligenceRelatedContent[];
  cannibalization: IntelligenceCannibalization;
  recommendations: IntelligenceRecommendation[];
  internalLinkCandidates: IntelligenceLinkCandidateSummary[];
}

export function isIntelligenceSnapshotV1(raw: unknown): raw is IntelligenceSnapshotV1 {
  return (
    !!raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    (raw as IntelligenceSnapshotV1).version === INTELLIGENCE_SNAPSHOT_VERSION
  );
}
