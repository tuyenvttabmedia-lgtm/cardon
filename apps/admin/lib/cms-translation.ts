export type CmsEditorLocale = 'vi' | 'en';
export type CmsTranslationStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | null;

export type EnglishPageDraft = {
  title: string;
  excerpt: string;
  content: string;
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string;
  ogTitle: string;
  ogDescription: string;
  status: CmsTranslationStatus;
};

export function emptyEnglishPageDraft(): EnglishPageDraft {
  return {
    title: '',
    excerpt: '',
    content: '',
    metaTitle: '',
    metaDescription: '',
    metaKeywords: '',
    ogTitle: '',
    ogDescription: '',
    status: null,
  };
}

export function translationStatusLabel(status: CmsTranslationStatus): string {
  if (status === 'PUBLISHED') return 'Đã xuất bản';
  if (status === 'DRAFT') return 'Bản nháp';
  if (status === 'ARCHIVED') return 'Đã lưu trữ';
  return 'Chưa có';
}

export function englishPagePayload(draft: EnglishPageDraft, status: 'DRAFT' | 'PUBLISHED') {
  return {
    title: draft.title.trim(),
    excerpt: draft.excerpt.trim(),
    content: draft.content.trim(),
    status,
    seo: {
      metaTitle: draft.metaTitle.trim(),
      metaDescription: draft.metaDescription.trim(),
      metaKeywords: draft.metaKeywords.trim(),
      ogTitle: draft.ogTitle.trim(),
      ogDescription: draft.ogDescription.trim(),
    },
  };
}

export function englishDraftFromPage(page?: {
  translations?: Array<{
    locale: 'vi' | 'en';
    title: string;
    excerpt?: string | null;
    content: string;
    status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  }>;
  seoTranslations?: Array<{
    locale: 'vi' | 'en';
    metaTitle?: string | null;
    metaDescription?: string | null;
    metaKeywords?: string | null;
    ogTitle?: string | null;
    ogDescription?: string | null;
  }>;
} | null): EnglishPageDraft {
  const row = page?.translations?.find((item) => item.locale === 'en');
  if (!row) return emptyEnglishPageDraft();
  const seo = page?.seoTranslations?.find((item) => item.locale === 'en');
  return {
    title: row.title,
    excerpt: row.excerpt ?? '',
    content: row.content,
    status: row.status,
    metaTitle: seo?.metaTitle ?? '',
    metaDescription: seo?.metaDescription ?? '',
    metaKeywords: seo?.metaKeywords ?? '',
    ogTitle: seo?.ogTitle ?? '',
    ogDescription: seo?.ogDescription ?? '',
  };
}
