import { HomeServiceType } from '@prisma/client';
import {
  auditCategories,
  buildCategoryMergePlan,
  detectParentLoops,
} from '../entities/category-integrity';
import type { CategoryIntegrityRow } from '../entities/category-integrity.types';

function row(
  partial: Partial<CategoryIntegrityRow> & Pick<CategoryIntegrityRow, 'id' | 'slug' | 'name' | 'homeService'>,
): CategoryIntegrityRow {
  return {
    parentId: null,
    sortOrder: 0,
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01'),
    productCount: 0,
    ...partial,
  };
}

describe('Phase 6O31.1 — Category integrity', () => {
  it('detects duplicate homeService roots', () => {
    const rows = [
      row({ id: '1', slug: 'game-card', name: 'Thẻ game', homeService: HomeServiceType.GAME_CARD }),
      row({ id: '2', slug: 'local-demo-cards', name: 'Thẻ game', homeService: HomeServiceType.GAME_CARD }),
    ];
    const report = auditCategories(rows);
    expect(report.issues.some((i) => i.type === 'duplicate_home_service_root')).toBe(true);
    expect(report.mergePlan).toHaveLength(1);
    expect(report.mergePlan[0].duplicateSlug).toBe('local-demo-cards');
    expect(report.mergePlan[0].canonicalSlug).toBe('game-card');
  });

  it('merges legacy demo child categories into canonical root', () => {
    const rows = [
      row({ id: '1', slug: 'game-card', name: 'Thẻ game', homeService: HomeServiceType.GAME_CARD }),
      row({
        id: '2',
        slug: 'local-demo-cards-game',
        name: 'Thẻ game (Thẻ game)',
        homeService: HomeServiceType.GAME_CARD,
        parentId: '1',
        productCount: 8,
      }),
    ];
    const plan = buildCategoryMergePlan(rows);
    expect(plan).toHaveLength(1);
    expect(plan[0].canonicalSlug).toBe('game-card');
  });

  it('detects parent loops', () => {
    const rows = [
      row({ id: '1', slug: 'a', name: 'A', homeService: HomeServiceType.GAME_CARD, parentId: '2' }),
      row({ id: '2', slug: 'b', name: 'B', homeService: HomeServiceType.GAME_CARD, parentId: '1' }),
    ];
    expect(detectParentLoops(rows)).toHaveLength(2);
  });

  it('keeps canonical roots when no duplicates exist', () => {
    const rows = [
      row({ id: '1', slug: 'game-card', name: 'Thẻ game', homeService: HomeServiceType.GAME_CARD, productCount: 8 }),
      row({ id: '2', slug: 'phone-card', name: 'Thẻ điện thoại', homeService: HomeServiceType.PHONE_CARD, productCount: 4 }),
      row({ id: '3', slug: 'topup', name: 'Nạp cước', homeService: HomeServiceType.TOPUP, productCount: 3 }),
      row({ id: '4', slug: 'data', name: 'Nạp Data', homeService: HomeServiceType.DATA, productCount: 2 }),
    ];
    const report = auditCategories(rows);
    expect(report.mergePlan).toHaveLength(0);
    expect(report.summary.issueCount).toBe(0);
  });
});
