import { ContentPlanContentType } from '@prisma/client';
import {
  cleanSeoArticleTitle,
  preferredCmsCategorySlug,
} from './cms-title-category.util';

describe('cms-title-category.util', () => {
  it('strips category-like prefixes from titles', () => {
    expect(cleanSeoArticleTitle('Hướng dẫn: Mua thẻ game', 'Mua thẻ game')).toBe(
      'Mua thẻ game',
    );
    expect(cleanSeoArticleTitle('FAQ - Nạp tiền', 'Nạp tiền')).toBe('Nạp tiền');
  });

  it('falls back to topic when title empty after strip', () => {
    expect(cleanSeoArticleTitle('Hướng dẫn:', 'Chủ đề test')).toBe('Chủ đề test');
  });

  it('maps GUIDE to huong-dan category slug', () => {
    expect(preferredCmsCategorySlug(ContentPlanContentType.GUIDE)).toBe('huong-dan');
    expect(preferredCmsCategorySlug(ContentPlanContentType.PROMOTION)).toBe('khuyen-mai');
  });
});
