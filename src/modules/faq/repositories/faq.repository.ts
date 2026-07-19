import { Injectable } from '@nestjs/common';
import { FaqCategoryStatus, FaqStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import {
  matchesViSearch,
  stripHtmlForSearch,
} from '../../../common/utils/vi-search.util';
import type { FaqWithRelations } from '../entities/faq.mapper';

const faqInclude = {
  category: true,
  positions: true,
} satisfies Prisma.FaqInclude;

@Injectable()
export class FaqRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCategories(includeInactive = false) {
    return this.prisma.faqCategory.findMany({
      where: includeInactive ? undefined : { status: FaqCategoryStatus.ACTIVE },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { faqs: true } } },
    });
  }

  findCategoryById(id: string) {
    return this.prisma.faqCategory.findUnique({
      where: { id },
      include: { _count: { select: { faqs: true } } },
    });
  }

  findCategoryBySlug(slug: string) {
    return this.prisma.faqCategory.findUnique({ where: { slug } });
  }

  createCategory(data: Prisma.FaqCategoryCreateInput) {
    return this.prisma.faqCategory.create({ data });
  }

  updateCategory(id: string, data: Prisma.FaqCategoryUpdateInput) {
    return this.prisma.faqCategory.update({ where: { id }, data });
  }

  deleteCategory(id: string) {
    return this.prisma.faqCategory.delete({ where: { id } });
  }

  countFaqsInCategory(categoryId: string) {
    return this.prisma.faq.count({ where: { categoryId } });
  }

  findFaqById(id: string): Promise<FaqWithRelations | null> {
    return this.prisma.faq.findUnique({
      where: { id },
      include: faqInclude,
    });
  }

  findFaqBySlug(slug: string): Promise<FaqWithRelations | null> {
    return this.prisma.faq.findUnique({
      where: { slug },
      include: faqInclude,
    });
  }

  findPublicFaqBySlugs(categorySlug: string, faqSlug: string): Promise<FaqWithRelations | null> {
    return this.prisma.faq.findFirst({
      where: {
        slug: faqSlug,
        status: FaqStatus.ACTIVE,
        category: { slug: categorySlug, status: FaqCategoryStatus.ACTIVE },
      },
      include: faqInclude,
    });
  }

  slugExists(slug: string, excludeId?: string) {
    return this.prisma.faq.findFirst({
      where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
  }

  categorySlugExists(slug: string, excludeId?: string) {
    return this.prisma.faqCategory.findFirst({
      where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
  }

  async listAdmin(params: {
    q?: string;
    categoryId?: string;
    position?: string;
    status?: FaqStatus;
    featured?: boolean;
    skip: number;
    take: number;
  }) {
    const where: Prisma.FaqWhereInput = {};

    if (params.categoryId) where.categoryId = params.categoryId;
    if (params.status) where.status = params.status;
    if (params.featured !== undefined) where.featured = params.featured;
    if (params.position) {
      where.positions = { some: { position: params.position } };
    }

    if (params.q?.trim()) {
      const rows = await this.prisma.faq.findMany({
        where,
        include: faqInclude,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
      const matched = this.filterFaqsByQuery(rows, params.q);
      return {
        items: matched.slice(params.skip, params.skip + params.take),
        total: matched.length,
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.faq.findMany({
        where,
        include: faqInclude,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.faq.count({ where }),
    ]);

    return { items, total };
  }

  async listPublic(params: {
    q?: string;
    categorySlug?: string;
    position?: string;
    featured?: boolean;
    skip: number;
    take: number;
  }) {
    const where: Prisma.FaqWhereInput = {
      status: FaqStatus.ACTIVE,
      category: { status: FaqCategoryStatus.ACTIVE },
    };

    if (params.categorySlug) {
      where.category = { slug: params.categorySlug, status: FaqCategoryStatus.ACTIVE };
    }
    if (params.featured !== undefined) where.featured = params.featured;
    if (params.position) {
      where.positions = { some: { position: params.position } };
    }

    if (params.q?.trim()) {
      const rows = await this.prisma.faq.findMany({
        where,
        include: faqInclude,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
      const matched = this.filterFaqsByQuery(rows, params.q);
      return {
        items: matched.slice(params.skip, params.skip + params.take),
        total: matched.length,
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.faq.findMany({
        where,
        include: faqInclude,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.faq.count({ where }),
    ]);

    return { items, total };
  }

  private filterFaqsByQuery(rows: FaqWithRelations[], query: string) {
    return rows.filter((row) =>
      matchesViSearch(
        query,
        row.question,
        stripHtmlForSearch(row.answer),
        row.slug,
        row.category.name,
        row.category.slug,
      ),
    );
  }

  createFaq(data: {
    id?: string;
    categoryId: string;
    question: string;
    answer: string;
    slug: string;
    featured: boolean;
    sortOrder?: number;
    status: FaqStatus;
    positions: string[];
  }) {
    return this.prisma.$transaction(async (tx) => {
      let sortOrder = data.sortOrder;
      if (sortOrder === undefined) {
        const agg = await tx.faq.aggregate({
          where: { categoryId: data.categoryId },
          _max: { sortOrder: true },
        });
        sortOrder = (agg._max.sortOrder ?? -1) + 1;
      }

      return tx.faq.create({
        data: {
          ...(data.id ? { id: data.id } : {}),
          categoryId: data.categoryId,
          question: data.question,
          answer: data.answer,
          slug: data.slug,
          featured: data.featured,
          sortOrder,
          status: data.status,
          positions: {
            create: data.positions.map((position) => ({ position })),
          },
        },
        include: faqInclude,
      });
    });
  }

  updateFaq(
    id: string,
    data: {
      categoryId?: string;
      question?: string;
      answer?: string;
      slug?: string;
      featured?: boolean;
      sortOrder?: number;
      status?: FaqStatus;
      positions?: string[];
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      if (data.positions) {
        await tx.faqPosition.deleteMany({ where: { faqId: id } });
        if (data.positions.length > 0) {
          await tx.faqPosition.createMany({
            data: data.positions.map((position) => ({ faqId: id, position })),
          });
        }
      }

      return tx.faq.update({
        where: { id },
        data: {
          categoryId: data.categoryId,
          question: data.question,
          answer: data.answer,
          slug: data.slug,
          featured: data.featured,
          sortOrder: data.sortOrder,
          status: data.status,
        },
        include: faqInclude,
      });
    });
  }

  deleteFaq(id: string) {
    return this.prisma.faq.delete({ where: { id } });
  }

  bulkUpdate(ids: string[], patch: { status?: FaqStatus; featured?: boolean }) {
    return this.prisma.faq.updateMany({
      where: { id: { in: ids } },
      data: patch,
    });
  }

  bulkSetPositions(ids: string[], positions: string[]) {
    return this.prisma.$transaction(async (tx) => {
      await tx.faqPosition.deleteMany({ where: { faqId: { in: ids } } });
      if (positions.length > 0) {
        await tx.faqPosition.createMany({
          data: ids.flatMap((faqId) => positions.map((position) => ({ faqId, position }))),
        });
      }
    });
  }

  incrementViewCount(id: string) {
    return this.prisma.faq.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });
  }

  countFeaturedActive() {
    return this.prisma.faq.count({
      where: { featured: true, status: FaqStatus.ACTIVE },
    });
  }

  listActiveSlugsForSitemap() {
    return this.prisma.faq.findMany({
      where: { status: FaqStatus.ACTIVE, category: { status: FaqCategoryStatus.ACTIVE } },
      select: {
        slug: true,
        updatedAt: true,
        category: { select: { slug: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  getLegacyJsonFaqItems(): Promise<unknown> {
    return this.prisma.systemSetting
      .findUnique({ where: { key: 'cms.faq.items' } })
      .then((row) => row?.value ?? []);
  }
}
