import type { Faq, FaqCategory, FaqPosition } from '@prisma/client';
import { sanitizeFaqHtml } from './faq-html-safety';

export type FaqLocale = 'vi' | 'en';

export type FaqWithRelations = Faq & {
  category: FaqCategory;
  positions: FaqPosition[];
};

function pickLocalized(
  locale: FaqLocale,
  vi: string | null | undefined,
  en: string | null | undefined,
): { text: string; fallback: boolean } {
  const viText = (vi ?? '').trim();
  const enText = (en ?? '').trim();
  if (locale === 'en' && enText) return { text: enText, fallback: false };
  return { text: viText, fallback: locale === 'en' && !enText && Boolean(viText) };
}

export function mapFaqCategoryPublic(row: FaqCategory, locale: FaqLocale = 'vi') {
  const name = pickLocalized(locale, row.name, row.nameEn);
  return {
    id: row.id,
    name: name.text || row.name,
    slug: row.slug,
    description: row.description,
    icon: row.icon,
    sortOrder: row.sortOrder,
    fallback: name.fallback,
  };
}

export function mapFaqPublic(row: FaqWithRelations, locale: FaqLocale = 'vi') {
  const question = pickLocalized(locale, row.question, row.questionEn);
  const answerSource = pickLocalized(locale, row.answer, row.answerEn);
  return {
    id: row.id,
    question: question.text || row.question,
    answer: sanitizeFaqHtml(answerSource.text || row.answer),
    slug: row.slug,
    featured: row.featured,
    sortOrder: row.sortOrder,
    viewCount: row.viewCount,
    category: mapFaqCategoryPublic(row.category, locale),
    positions: row.positions.map((p) => p.position),
    updatedAt: row.updatedAt.toISOString(),
    locale,
    fallback: question.fallback || answerSource.fallback,
  };
}

export function mapFaqAdmin(row: FaqWithRelations) {
  return {
    id: row.id,
    categoryId: row.categoryId,
    question: row.question,
    questionEn: row.questionEn,
    answer: row.answer,
    answerEn: row.answerEn,
    slug: row.slug,
    featured: row.featured,
    sortOrder: row.sortOrder,
    status: row.status,
    viewCount: row.viewCount,
    category: mapFaqCategoryPublic(row.category, 'vi'),
    positions: row.positions.map((p) => p.position),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapFaqCategoryAdmin(row: FaqCategory & { _count?: { faqs: number } }) {
  return {
    id: row.id,
    name: row.name,
    nameEn: row.nameEn,
    slug: row.slug,
    description: row.description,
    icon: row.icon,
    sortOrder: row.sortOrder,
    status: row.status,
    faqCount: row._count?.faqs ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
