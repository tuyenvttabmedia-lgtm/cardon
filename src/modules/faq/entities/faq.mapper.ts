import type { Faq, FaqCategory, FaqPosition } from '@prisma/client';
import { sanitizeFaqHtml } from './faq-html-safety';

export type FaqWithRelations = Faq & {
  category: FaqCategory;
  positions: FaqPosition[];
};

export function mapFaqCategoryPublic(row: FaqCategory) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    icon: row.icon,
    sortOrder: row.sortOrder,
  };
}

export function mapFaqPublic(row: FaqWithRelations) {
  return {
    id: row.id,
    question: row.question,
    answer: sanitizeFaqHtml(row.answer),
    slug: row.slug,
    featured: row.featured,
    sortOrder: row.sortOrder,
    viewCount: row.viewCount,
    category: mapFaqCategoryPublic(row.category),
    positions: row.positions.map((p) => p.position),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapFaqAdmin(row: FaqWithRelations) {
  return {
    id: row.id,
    categoryId: row.categoryId,
    question: row.question,
    answer: row.answer,
    slug: row.slug,
    featured: row.featured,
    sortOrder: row.sortOrder,
    status: row.status,
    viewCount: row.viewCount,
    category: mapFaqCategoryPublic(row.category),
    positions: row.positions.map((p) => p.position),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapFaqCategoryAdmin(row: FaqCategory & { _count?: { faqs: number } }) {
  return {
    id: row.id,
    name: row.name,
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
