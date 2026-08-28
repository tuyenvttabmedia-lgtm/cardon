import { ContentPlanStatus } from '@prisma/client';
import {
  assertContentPlanTransition,
  canTransitionContentPlan,
  shouldBumpGenerationEpoch,
} from './content-plan-state.machine';

describe('content-plan-state.machine', () => {
  it('allows DRAFT -> PLANNED', () => {
    expect(canTransitionContentPlan(ContentPlanStatus.DRAFT, ContentPlanStatus.PLANNED)).toBe(
      true,
    );
  });

  it('blocks DRAFT -> PUBLISHED', () => {
    expect(canTransitionContentPlan(ContentPlanStatus.DRAFT, ContentPlanStatus.PUBLISHED)).toBe(
      false,
    );
  });

  it('keeps APPROVED distinct from PUBLISHED', () => {
    expect(canTransitionContentPlan(ContentPlanStatus.APPROVED, ContentPlanStatus.PUBLISHED)).toBe(
      true,
    );
    expect(canTransitionContentPlan(ContentPlanStatus.IN_REVIEW, ContentPlanStatus.PUBLISHED)).toBe(
      false,
    );
  });

  it('throws on invalid transition', () => {
    expect(() =>
      assertContentPlanTransition(ContentPlanStatus.DRAFT, ContentPlanStatus.PUBLISHED),
    ).toThrow(/Invalid content plan transition/);
  });

  it('requires epoch bump for re-outline', () => {
    expect(shouldBumpGenerationEpoch(ContentPlanStatus.PLANNED, 're-outline')).toBe(true);
    expect(shouldBumpGenerationEpoch(ContentPlanStatus.DRAFT, 're-outline')).toBe(false);
  });
});
