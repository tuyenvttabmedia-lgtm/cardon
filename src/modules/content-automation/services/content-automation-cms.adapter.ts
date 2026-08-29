import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CmsPageStatus, CmsPageType } from '@prisma/client';
import type { ContentPlan } from '@prisma/client';
import { CmsService } from '../../cms/services/cms.service';
import type { ArticleDocumentV1 } from '../entities/article-document.types';
import type { GenerationContext } from '../entities/generation-context.types';
import { renderArticleDocumentHtml } from '../renderers/article-document.renderer';
import {
  cleanSeoArticleTitle,
  preferredCmsCategorySlug,
} from '../utils/cms-title-category.util';
import { slugifyTitle } from '../utils/slug.util';

export interface CreateCmsDraftResult {
  cmsPageId: string;
  created: boolean;
  slug: string;
  /** True when an existing slug conflict was resolved by attaching that page. */
  resolvedSlugConflict?: boolean;
}

@Injectable()
export class ContentAutomationCmsAdapter {
  private readonly logger = new Logger(ContentAutomationCmsAdapter.name);

  constructor(private readonly cmsService: CmsService) {}

  async createOrUpdateBlogDraft(
    authorId: string,
    plan: ContentPlan,
    doc: ArticleDocumentV1,
    context: GenerationContext,
    force: boolean,
  ): Promise<CreateCmsDraftResult> {
    const pageLookup = new Map(context.existingContent.map((c) => [c.pageId, c]));
    const html = renderArticleDocumentHtml(doc, pageLookup);
    const title = cleanSeoArticleTitle(doc.title, plan.topic);
    const slug = slugifyTitle(title);
    const categoryId = await this.resolveCategoryId(plan.contentType);
    const seoPayload = {
      metaTitle: cleanSeoArticleTitle(doc.seo.metaTitle, title),
      metaDescription: doc.seo.metaDescription,
      focusKeyword: doc.seo.focusKeyword,
      canonicalUrl: doc.seo.canonicalUrl,
      robots: doc.seo.robots ?? 'index,follow',
    };

    if (plan.cmsPageId && !force) {
      try {
        await this.cmsService.getPage(plan.cmsPageId);
        return { cmsPageId: plan.cmsPageId, created: false, slug };
      } catch (err) {
        if (!(err instanceof NotFoundException)) throw err;
      }
    }

    if (plan.cmsPageId && force) {
      const existing = await this.cmsService.getPage(plan.cmsPageId);
      if (existing.status === CmsPageStatus.PUBLISHED || existing.status === CmsPageStatus.ARCHIVED) {
        throw new ConflictException('Cannot force-update published or archived CMS page');
      }

      await this.cmsService.updatePage(plan.cmsPageId, {
        title,
        content: html,
        excerpt: doc.excerpt,
        seo: seoPayload,
        ...(categoryId ? { categoryId } : {}),
      });

      return { cmsPageId: plan.cmsPageId, created: false, slug: existing.slug };
    }

    try {
      const page = await this.cmsService.createPage(authorId, {
        type: CmsPageType.BLOG_POST,
        slug,
        title,
        content: html,
        excerpt: doc.excerpt,
        status: CmsPageStatus.DRAFT,
        seo: seoPayload,
        ...(categoryId ? { categoryId } : {}),
      });

      return { cmsPageId: page.id, created: true, slug: page.slug };
    } catch (err) {
      if (!(err instanceof ConflictException)) throw err;

      const existing = await this.cmsService.findPageBySlug(slug);
      if (!existing || existing.type !== CmsPageType.BLOG_POST) {
        throw new ConflictException({ error: 'SLUG_CONFLICT', message: 'Slug already exists' });
      }

      if (
        existing.status === CmsPageStatus.PUBLISHED ||
        existing.status === CmsPageStatus.ARCHIVED
      ) {
        throw new ConflictException({
          error: 'SLUG_CONFLICT',
          message: 'Slug already exists on a published/archived page',
        });
      }

      this.logger.warn(
        `Slug conflict resolved by attaching existing draft page=${existing.id} slug=${slug} plan=${plan.id}`,
      );

      if (force) {
        await this.cmsService.updatePage(existing.id, {
          title,
          content: html,
          excerpt: doc.excerpt,
          seo: seoPayload,
          ...(categoryId ? { categoryId } : {}),
        });
      }

      return {
        cmsPageId: existing.id,
        created: false,
        slug: existing.slug,
        resolvedSlugConflict: true,
      };
    }
  }

  private async resolveCategoryId(contentType: ContentPlan['contentType']): Promise<string | null> {
    const slug = preferredCmsCategorySlug(contentType);
    if (!slug) return null;
    try {
      const category = await this.cmsService.getCategoryBySlug(slug);
      return category?.id ?? null;
    } catch {
      this.logger.warn(`CMS category slug not found for contentType=${contentType} slug=${slug}`);
      return null;
    }
  }
}
