import type { ContentPlan } from '@prisma/client';
import type { BrandContext } from './brand-context.types';
import type { FactContext } from './fact-context.types';
import type { InternalLinkCandidate } from './internal-link-candidate.types';
import type { PlanReferences } from './plan-references.types';

export interface ExistingContentItem {
  pageId: string;
  title: string;
  slug: string;
  type: string;
  status: string;
  categorySlug: string | null;
  focusKeyword: string | null;
  publicPath: string;
}

export interface UserProvidedPlanContext {
  topic: string;
  primaryKeyword: string;
  searchIntent: string;
  contentType: string;
  audience: string | null;
  businessObjective: string | null;
  supportingKeywords: string[];
  angle: string | null;
}

export interface GenerationContext {
  plan: ContentPlan;
  userProvided: UserProvidedPlanContext;
  references: PlanReferences;
  brandContext: BrandContext;
  factContext: FactContext;
  existingContent: ExistingContentItem[];
  internalLinkCandidates: InternalLinkCandidate[];
  /** M2: empty — reserved for M3 AI-generated outputs. */
  aiGenerated: Record<string, never>;
}
