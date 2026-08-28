import { ContentPlanStatus } from '@prisma/client';

const ALLOWED_TRANSITIONS: Readonly<Record<ContentPlanStatus, readonly ContentPlanStatus[]>> = {
  [ContentPlanStatus.DRAFT]: [
    ContentPlanStatus.PLANNED,
    ContentPlanStatus.ARCHIVED,
  ],
  [ContentPlanStatus.PLANNED]: [
    ContentPlanStatus.OUTLINE_READY,
    ContentPlanStatus.ARCHIVED,
  ],
  [ContentPlanStatus.OUTLINE_READY]: [
    ContentPlanStatus.OUTLINE_APPROVED,
    ContentPlanStatus.PLANNED,
    ContentPlanStatus.ARCHIVED,
  ],
  [ContentPlanStatus.OUTLINE_APPROVED]: [
    ContentPlanStatus.CONTENT_READY,
    ContentPlanStatus.PLANNED,
    ContentPlanStatus.ARCHIVED,
  ],
  [ContentPlanStatus.CONTENT_READY]: [
    ContentPlanStatus.IN_REVIEW,
    ContentPlanStatus.ARCHIVED,
  ],
  [ContentPlanStatus.IN_REVIEW]: [
    ContentPlanStatus.APPROVED,
    ContentPlanStatus.OUTLINE_APPROVED,
    ContentPlanStatus.PLANNED,
    ContentPlanStatus.ARCHIVED,
  ],
  [ContentPlanStatus.APPROVED]: [
    ContentPlanStatus.PUBLISHED,
    ContentPlanStatus.ARCHIVED,
  ],
  [ContentPlanStatus.PUBLISHED]: [ContentPlanStatus.ARCHIVED],
  [ContentPlanStatus.ARCHIVED]: [],
};

export function canTransitionContentPlan(
  from: ContentPlanStatus,
  to: ContentPlanStatus,
): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertContentPlanTransition(
  from: ContentPlanStatus,
  to: ContentPlanStatus,
): void {
  if (!canTransitionContentPlan(from, to)) {
    throw new Error(`Invalid content plan transition: ${from} -> ${to}`);
  }
}

/** Epoch must increment before re-outline, re-write, or regenerate (Master Spec v1.0 §8.2). */
export function shouldBumpGenerationEpoch(
  from: ContentPlanStatus,
  target: 're-outline' | 're-write' | 'regenerate',
): boolean {
  switch (target) {
    case 're-outline':
      return from === ContentPlanStatus.PLANNED || from === ContentPlanStatus.OUTLINE_READY;
    case 're-write':
      return (
        from === ContentPlanStatus.OUTLINE_APPROVED ||
        from === ContentPlanStatus.IN_REVIEW
      );
    case 'regenerate':
      return true;
    default:
      return false;
  }
}
