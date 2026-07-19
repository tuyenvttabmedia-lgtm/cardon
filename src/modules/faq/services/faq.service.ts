import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FaqCategoryStatus, FaqStatus } from '@prisma/client';
import { slugifyVi } from '../../cms/entities/cms-slug.util';
import {
  BulkUpdateFaqDto,
  CreateFaqCategoryDto,
  CreateFaqDto,
  ListFaqAdminQueryDto,
  ListFaqPublicQueryDto,
  UpdateFaqCategoryDto,
  UpdateFaqDto,
} from '../dto/faq.dto';
import {
  DEFAULT_FAQ_CATEGORY_SLUG,
  isKnownFaqPosition,
  LegacyCmsFaqItem,
} from '../entities/faq.constants';
import { sanitizeFaqHtml, wrapPlainAnswer } from '../entities/faq-html-safety';
import { mapFaqAdmin, mapFaqCategoryAdmin, mapFaqPublic } from '../entities/faq.mapper';
import { FaqRepository } from '../repositories/faq.repository';

@Injectable()
export class FaqService {
  constructor(private readonly repository: FaqRepository) {}

  // ─── Categories ───────────────────────────────────────────────────────────

  listCategoriesAdmin() {
    return this.repository.findCategories(true).then((rows) => rows.map(mapFaqCategoryAdmin));
  }

  listCategoriesPublic() {
    return this.repository.findCategories(false).then((rows) =>
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        icon: row.icon,
        sortOrder: row.sortOrder,
      })),
    );
  }

  async createCategory(dto: CreateFaqCategoryDto) {
    const slug = await this.ensureUniqueCategorySlug(dto.slug?.trim() || slugifyVi(dto.name));
    const row = await this.repository.createCategory({
      name: dto.name.trim(),
      slug,
      description: dto.description?.trim() || null,
      icon: dto.icon?.trim() || null,
      sortOrder: dto.sortOrder ?? 0,
      status: dto.status ?? FaqCategoryStatus.ACTIVE,
    });
    return mapFaqCategoryAdmin({ ...row, _count: { faqs: 0 } });
  }

  async updateCategory(id: string, dto: UpdateFaqCategoryDto) {
    const existing = await this.repository.findCategoryById(id);
    if (!existing) throw new NotFoundException('Danh mục FAQ không tồn tại');

    let slug = existing.slug;
    if (dto.slug !== undefined) {
      slug = await this.ensureUniqueCategorySlug(dto.slug.trim() || slugifyVi(dto.name ?? existing.name), id);
    } else if (dto.name !== undefined) {
      slug = existing.slug;
    }

    const row = await this.repository.updateCategory(id, {
      name: dto.name?.trim(),
      slug,
      description: dto.description !== undefined ? dto.description.trim() || null : undefined,
      icon: dto.icon !== undefined ? dto.icon.trim() || null : undefined,
      sortOrder: dto.sortOrder,
      status: dto.status,
    });
    const count = await this.repository.countFaqsInCategory(id);
    return mapFaqCategoryAdmin({ ...row, _count: { faqs: count } });
  }

  async deleteCategory(id: string) {
    const existing = await this.repository.findCategoryById(id);
    if (!existing) throw new NotFoundException('Danh mục FAQ không tồn tại');
    const count = await this.repository.countFaqsInCategory(id);
    if (count > 0) {
      throw new ConflictException('Không thể xóa danh mục còn FAQ');
    }
    await this.repository.deleteCategory(id);
    return { deleted: true };
  }

  // ─── Admin FAQs ───────────────────────────────────────────────────────────

  async listFaqsAdmin(query: ListFaqAdminQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const { items, total } = await this.repository.listAdmin({
      q: query.q,
      categoryId: query.categoryId,
      position: query.position,
      status: query.status,
      featured: this.toOptionalBoolean(query.featured),
      skip,
      take: limit,
    });

    return {
      items: items.map(mapFaqAdmin),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getFaqAdmin(id: string) {
    const row = await this.repository.findFaqById(id);
    if (!row) throw new NotFoundException('FAQ không tồn tại');
    return mapFaqAdmin(row);
  }

  async createFaq(dto: CreateFaqDto) {
    await this.assertCategoryExists(dto.categoryId);
    const positions = this.normalizePositions(dto.positions);
    const slug = await this.ensureUniqueFaqSlug(dto.slug?.trim() || slugifyVi(dto.question));
    const answer = sanitizeFaqHtml(wrapPlainAnswer(dto.answer));

    const row = await this.repository.createFaq({
      categoryId: dto.categoryId,
      question: dto.question.trim(),
      answer,
      slug,
      featured: dto.featured ?? false,
      status: dto.status ?? FaqStatus.DRAFT,
      positions,
    });

    return mapFaqAdmin(row);
  }

  async updateFaq(id: string, dto: UpdateFaqDto) {
    const existing = await this.repository.findFaqById(id);
    if (!existing) throw new NotFoundException('FAQ không tồn tại');

    if (dto.categoryId) await this.assertCategoryExists(dto.categoryId);

    let slug = existing.slug;
    if (dto.slug !== undefined) {
      slug = await this.ensureUniqueFaqSlug(dto.slug.trim() || slugifyVi(dto.question ?? existing.question), id);
    }

    const answer =
      dto.answer !== undefined
        ? sanitizeFaqHtml(wrapPlainAnswer(dto.answer))
        : undefined;

    const row = await this.repository.updateFaq(id, {
      categoryId: dto.categoryId,
      question: dto.question?.trim(),
      answer,
      slug,
      featured: dto.featured,
      sortOrder: dto.sortOrder,
      status: dto.status,
      positions: dto.positions !== undefined ? this.normalizePositions(dto.positions) : undefined,
    });

    return mapFaqAdmin(row);
  }

  async deleteFaq(id: string) {
    const existing = await this.repository.findFaqById(id);
    if (!existing) throw new NotFoundException('FAQ không tồn tại');
    await this.repository.deleteFaq(id);
    return { deleted: true };
  }

  async bulkUpdateFaqs(dto: BulkUpdateFaqDto) {
    if (dto.ids.length === 0) throw new BadRequestException('Chưa chọn FAQ');
    const patch: { status?: FaqStatus; featured?: boolean } = {};
    if (dto.patch.status !== undefined) patch.status = dto.patch.status;
    if (dto.patch.featured !== undefined) patch.featured = dto.patch.featured;

    if (Object.keys(patch).length > 0) {
      await this.repository.bulkUpdate(dto.ids, patch);
    }
    if (dto.patch.positions !== undefined) {
      const positions = this.normalizePositions(dto.patch.positions);
      await this.repository.bulkSetPositions(dto.ids, positions);
    }

    return { updated: dto.ids.length };
  }

  // ─── Public ───────────────────────────────────────────────────────────────

  listFaqsPublic(query: ListFaqPublicQueryDto & { legacyCategory?: string }) {
    const resolved = this.resolvePublicQuery(query);
    const limit = Math.min(resolved.limit ?? 20, 100);
    const skip = resolved.offset ?? 0;

    return this.repository
      .listPublic({
        q: resolved.q,
        categorySlug: resolved.categorySlug,
        position: resolved.position,
        featured: resolved.featured,
        skip,
        take: limit,
      })
      .then(({ items, total }) => ({
        items: items.map(mapFaqPublic),
        total,
        offset: skip,
        limit,
      }));
  }

  async getPublicFaqDetail(categorySlug: string, faqSlug: string) {
    const row = await this.repository.findPublicFaqBySlugs(categorySlug, faqSlug);
    if (!row) throw new NotFoundException('FAQ không tồn tại');
    await this.repository.incrementViewCount(row.id);

    const related = await this.repository.listPublic({
      categorySlug,
      skip: 0,
      take: 5,
    });

    return {
      faq: mapFaqPublic(row),
      related: related.items
        .filter((item) => item.id !== row.id)
        .slice(0, 5)
        .map(mapFaqPublic),
    };
  }

  listSitemapFaqs() {
    return this.repository.listActiveSlugsForSitemap();
  }

  // ─── Migration ────────────────────────────────────────────────────────────

  async migrateFromLegacyJson() {
    const raw = await this.repository.getLegacyJsonFaqItems();
    if (!Array.isArray(raw) || raw.length === 0) {
      return { migrated: 0, skipped: 0, featured: 0, message: 'No legacy FAQ data' };
    }

    const defaultCategory = await this.repository.findCategoryBySlug(DEFAULT_FAQ_CATEGORY_SLUG);
    if (!defaultCategory) {
      throw new BadRequestException('Default FAQ category "chung" not found — run migration SQL first');
    }

    const items = (raw as LegacyCmsFaqItem[]).filter((i) => i?.question?.trim() && i?.answer?.trim());
    const homepageCandidates = items
      .filter((i) => i.category === 'homepage' || i.category === 'general')
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    const featuredIds = new Set(homepageCandidates.slice(0, 10).map((i) => i.id));

    let migrated = 0;
    let skipped = 0;
    const usedSlugs = new Set<string>();

    for (const item of items.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))) {
      const existing = await this.repository.findFaqById(item.id);
      if (existing) {
        skipped += 1;
        continue;
      }

      let slug = slugifyVi(item.question);
      if (!slug) slug = `faq-${item.id.slice(0, 8)}`;
      let candidate = slug;
      let n = 2;
      while (usedSlugs.has(candidate) || (await this.repository.slugExists(candidate))) {
        candidate = `${slug}-${n++}`;
      }
      usedSlugs.add(candidate);

      const positions: string[] = [];
      if (item.category === 'contact') positions.push('contact');

      const status =
        item.status === 'INACTIVE' ? FaqStatus.INACTIVE : FaqStatus.ACTIVE;

      await this.repository.createFaq({
        id: item.id,
        categoryId: defaultCategory.id,
        question: item.question.trim(),
        answer: sanitizeFaqHtml(wrapPlainAnswer(item.answer.trim())),
        slug: candidate,
        featured: featuredIds.has(item.id),
        sortOrder: item.sortOrder ?? 0,
        status,
        positions,
      });
      migrated += 1;
    }

    return {
      migrated,
      skipped,
      featured: featuredIds.size,
      total: items.length,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private toOptionalBoolean(value: unknown): boolean | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0') return false;
    return undefined;
  }

  private toOptionalInt(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const n = Number(value);
    if (!Number.isFinite(n)) return undefined;
    return Math.max(0, Math.floor(n));
  }

  private resolvePublicQuery(query: ListFaqPublicQueryDto & { legacyCategory?: string }) {
    const legacy = query.legacyCategory ?? query.category;
    let categorySlug: string | undefined;
    let position: string | undefined = query.position;
    let featured: boolean | undefined = this.toOptionalBoolean(query.featured);

    if (legacy === 'homepage' || legacy === 'general') {
      featured = true;
      categorySlug = undefined;
    } else if (legacy === 'guide') {
      categorySlug = 'guide';
    } else if (legacy === 'contact') {
      position = 'contact';
    } else if (legacy && legacy !== 'homepage' && legacy !== 'general' && legacy !== 'contact') {
      categorySlug = legacy;
    }

    return {
      q: query.q,
      categorySlug,
      position,
      featured,
      offset: this.toOptionalInt(query.offset),
      limit: this.toOptionalInt(query.limit),
    };
  }

  private normalizePositions(positions?: string[]) {
    if (!positions?.length) return [];
    const unique = [...new Set(positions.map((p) => p.trim()).filter(Boolean))];
    for (const p of unique) {
      if (!isKnownFaqPosition(p)) {
        throw new BadRequestException(`Vị trí FAQ không hợp lệ: ${p}`);
      }
    }
    return unique;
  }

  private async assertCategoryExists(categoryId: string) {
    const cat = await this.repository.findCategoryById(categoryId);
    if (!cat) throw new BadRequestException('Danh mục FAQ không tồn tại');
  }

  private async ensureUniqueFaqSlug(base: string, excludeId?: string) {
    const slug = slugifyVi(base) || 'faq';
    let candidate = slug;
    let n = 2;
    while (await this.repository.slugExists(candidate, excludeId)) {
      candidate = `${slug}-${n++}`;
    }
    return candidate;
  }

  private async ensureUniqueCategorySlug(base: string, excludeId?: string) {
    const slug = slugifyVi(base) || 'danh-muc';
    let candidate = slug;
    let n = 2;
    while (await this.repository.categorySlugExists(candidate, excludeId)) {
      candidate = `${slug}-${n++}`;
    }
    return candidate;
  }
}
