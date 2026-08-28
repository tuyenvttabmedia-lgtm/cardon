import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CmsPageStatus, CmsPageType } from '@prisma/client';
import { CmsService } from '../../cms/services/cms.service';
import type {
  InternalLinkCandidate,
  InternalLinkCandidateQuery,
} from '../entities/internal-link-candidate.types';
import { ExistingContentContextService } from './existing-content-context.service';
import { resolveCmsPublicPath } from '../utils/cms-path.util';

@Injectable()
export class InternalLinkCandidateService {
  constructor(
    private readonly cmsService: CmsService,
    private readonly existingContent: ExistingContentContextService,
  ) {}

  async listCandidates(query: InternalLinkCandidateQuery): Promise<InternalLinkCandidate[]> {
    const limit = query.limit ?? 20;
    const keyword = query.keyword?.trim() ?? '';
    const related = keyword
      ? await this.existingContent.findByKeyword(keyword, limit)
      : await this.existingContent.listPublishedBlogContent(limit);

    const candidates: InternalLinkCandidate[] = [];
    for (const item of related) {
      if (query.excludePageId && item.pageId === query.excludePageId) continue;
      const validated = await this.validateTargetPageId(item.pageId, query.excludePageId);
      candidates.push({
        targetPageId: item.pageId,
        anchorText: item.title,
        reason: keyword
          ? `Liên quan từ khóa "${keyword}"`
          : 'Bài viết đã xuất bản liên quan',
        confidence: Math.min(1, 0.4 + item.title.length / 200),
        validated: validated.valid,
        validationError: validated.error,
        publicPath: item.publicPath,
      });
    }
    return candidates.slice(0, limit);
  }

  async validateTargetPageId(
    targetPageId: string,
    excludePageId?: string | null,
  ): Promise<{ valid: boolean; error?: string; publicPath?: string }> {
    if (excludePageId && targetPageId === excludePageId) {
      return { valid: false, error: 'SELF_LINK' };
    }

    let page;
    try {
      page = await this.cmsService.getPage(targetPageId);
    } catch (err) {
      if (err instanceof NotFoundException) {
        return { valid: false, error: 'PAGE_NOT_FOUND' };
      }
      throw err;
    }

    if (page.type !== CmsPageType.BLOG_POST) {
      return { valid: false, error: 'NOT_BLOG_POST' };
    }

    if (page.status !== CmsPageStatus.PUBLISHED) {
      return { valid: false, error: 'NOT_PUBLISHED' };
    }

    const categorySlug = page.categoryRel?.slug ?? null;
    return {
      valid: true,
      publicPath: resolveCmsPublicPath(page.type, page.slug, categorySlug),
    };
  }

  assertValidTargetPageId(targetPageId: string, excludePageId?: string | null): void {
    if (!targetPageId) {
      throw new BadRequestException('targetPageId is required');
    }
  }
}
