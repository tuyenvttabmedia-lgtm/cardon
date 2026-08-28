export const OUTLINE_VERSION = '1' as const;

export interface OutlineSectionV1 {
  id: string;
  heading: string;
  level: 2 | 3;
  summary: string;
  keyPoints: string[];
  targetWordCount?: number;
}

export interface OutlineV1 {
  version: typeof OUTLINE_VERSION;
  generatedAt: string;
  source: 'AI' | 'HEURISTIC';
  title: string;
  excerpt?: string;
  sections: OutlineSectionV1[];
  seoNotes?: {
    metaTitleHint?: string;
    metaDescriptionHint?: string;
  };
}

export function isOutlineV1(raw: unknown): raw is OutlineV1 {
  return (
    !!raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    (raw as OutlineV1).version === OUTLINE_VERSION
  );
}
