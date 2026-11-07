import { describe, expect, it } from 'vitest';
import { englishDraftFromPage, englishPagePayload, translationStatusLabel } from './cms-translation';

describe('admin CMS translation drafts', () => {
  it('labels missing, draft and published translations', () => {
    expect(translationStatusLabel(null)).toBe('Chưa có');
    expect(translationStatusLabel('DRAFT')).toBe('Bản nháp');
    expect(translationStatusLabel('PUBLISHED')).toBe('Đã xuất bản');
  });

  it('keeps the unsaved English draft when the Vietnamese draft changes', () => {
    const english = englishDraftFromPage(null);
    const edited = { ...english, title: 'English title', content: '<p>English</p>' };
    const vietnamese = { title: 'Tiêu đề Việt' };
    expect(edited.title).toBe('English title');
    expect(vietnamese.title).toBe('Tiêu đề Việt');
    expect(englishPagePayload(edited, 'DRAFT')).toMatchObject({
      title: 'English title',
      status: 'DRAFT',
    });
    expect(englishPagePayload(edited, 'DRAFT')).not.toHaveProperty('slug');
  });

  it('loads only the English row and does not copy Vietnamese content', () => {
    const draft = englishDraftFromPage({
      translations: [
        { locale: 'vi', title: 'Việt', excerpt: 'Việt', content: '<p>Việt</p>', status: 'PUBLISHED' },
        { locale: 'en', title: 'English', excerpt: null, content: '<p>English</p>', status: 'DRAFT' },
      ],
      seoTranslations: [{ locale: 'vi', metaTitle: 'SEO Việt', metaDescription: 'Mô tả' }],
    });
    expect(draft).toMatchObject({ title: 'English', content: '<p>English</p>', status: 'DRAFT', metaTitle: '' });
  });
});
