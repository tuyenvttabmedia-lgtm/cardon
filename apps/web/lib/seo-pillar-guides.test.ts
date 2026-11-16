import { describe, expect, it } from 'vitest';
import { articleHubCtaForCategory, mixHomeNewsPosts } from './seo-pillar-guides';

describe('seo pillar guides', () => {
  it('maps phone category to phone hub', () => {
    expect(articleHubCtaForCategory('the-dien-thoai').hubHref).toBe('/the-dien-thoai');
  });

  it('mixes pillars before latest and skips duplicates', () => {
    const mixed = mixHomeNewsPosts(
      [
        { slug: 'promo-a', categorySlug: 'khuyen-mai' },
        { slug: 'guide-b', categorySlug: 'huong-dan' },
        { slug: 'pillar-1', categorySlug: 'the-game' },
      ],
      [
        { slug: 'pillar-1', categorySlug: 'the-game' },
        { slug: 'pillar-2', categorySlug: 'the-dien-thoai' },
      ],
      4,
    );
    expect(mixed.map((p) => p.slug)).toEqual(['pillar-1', 'pillar-2', 'guide-b', 'promo-a']);
  });
});
