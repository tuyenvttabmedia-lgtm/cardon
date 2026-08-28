import { Injectable } from '@nestjs/common';
import { CmsPageStatus, CmsPageType } from '@prisma/client';
import { CmsService } from '../../cms/services/cms.service';
import type { ExistingContentItem } from '../entities/generation-context.types';
import { resolveCmsPublicPath } from '../utils/cms-path.util';

type CmsPageRow = Awaited<ReturnType<CmsService['listPages']>>[number];

@Injectable()
export class ExistingContentContextService {
  constructor(private readonly cmsService: CmsService) {}

  async listPublishedBlogContent(limit = 10): Promise<ExistingContentItem[]> {
    const pages = await this.cmsService.listPages({
      type: CmsPageType.BLOG_POST,
      status: CmsPageStatus.PUBLISHED,
    });
    return pages.slice(0, limit).map((page) => this.mapPage(page));
  }

  async findByKeyword(keyword: string, limit = 10): Promise<ExistingContentItem[]> {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized) return [];

    const pages = await this.cmsService.listPages({
      type: CmsPageType.BLOG_POST,
      status: CmsPageStatus.PUBLISHED,
    });

    return pages
      .map((page) => ({
        page,
        score: this.scorePage(page, normalized),
      }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((row) => this.mapPage(row.page));
  }

  scorePage(page: CmsPageRow, normalizedKeyword: string): number {
    const tokens = normalizedKeyword.split(/\s+/).filter(Boolean);
    const haystack = [
      page.title,
      page.slug,
      page.excerpt ?? '',
      page.seo?.focusKeyword ?? '',
      page.seo?.metaTitle ?? '',
    ]
      .join(' ')
      .toLowerCase();

    let score = 0;
    if (haystack.includes(normalizedKeyword)) score += 3;
    for (const token of tokens) {
      if (token.length >= 2 && haystack.includes(token)) score += 1;
    }
    return score;
  }

  private mapPage(page: CmsPageRow): ExistingContentItem {
    const categorySlug = page.categoryRel?.slug ?? null;
    return {
      pageId: page.id,
      title: page.title,
      slug: page.slug,
      type: page.type,
      status: page.status,
      categorySlug,
      focusKeyword: page.seo?.focusKeyword ?? null,
      publicPath: resolveCmsPublicPath(page.type, page.slug, categorySlug),
    };
  }
}
