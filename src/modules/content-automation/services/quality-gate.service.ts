import { Injectable } from '@nestjs/common';
import { CmsPageStatus, CmsPageType } from '@prisma/client';
import type { ContentPlan } from '@prisma/client';
import type { ArticleDocumentV1 } from '../entities/article-document.types';
import {
  QUALITY_REPORT_VERSION,
  type QualityCheckItem,
  type QualityReportV1,
} from '../entities/quality-report.types';
import type { GenerationContext } from '../entities/generation-context.types';
import {
  ArticleDocumentValidationError,
  validateArticleDocumentLayer1,
} from '../validators/article-document.validator';
import { CmsService } from '../../cms/services/cms.service';
import { slugifyTitle } from '../utils/slug.util';

@Injectable()
export class QualityGateService {
  constructor(private readonly cmsService: CmsService) {}

  runGate(
    plan: ContentPlan,
    doc: ArticleDocumentV1,
    context: GenerationContext,
  ): QualityReportV1 {
    return this.runGateSync(plan, doc, context);
  }

  /** Async gate with CMS slug/title collision (Layer 2). */
  async runGateAsync(
    plan: ContentPlan,
    doc: ArticleDocumentV1,
    context: GenerationContext,
  ): Promise<QualityReportV1> {
    const report = this.runGateSync(plan, doc, context);
    const slug = slugifyTitle(doc.title);
    const titleLower = doc.title.trim().toLowerCase();

    try {
      const pages = await this.cmsService.listPages({
        type: CmsPageType.BLOG_POST,
      });
      const conflict = pages.find(
        (p) =>
          p.id !== plan.cmsPageId &&
          (p.slug === slug || p.title.trim().toLowerCase() === titleLower),
      );
      if (conflict) {
        report.checks.push(
          failed(
            'SLUG_TITLE_COLLISION',
            2,
            `Slug/title conflicts with existing page ${conflict.id} (${conflict.slug})`,
          ),
        );
        report.layer2Passed = !report.checks.some((c) => c.layer === 2 && !c.passed);
        report.passed = report.layer1Passed && report.layer2Passed;
      } else {
        report.checks.push(passed('SLUG_UNIQUE', 2, `Slug available: ${slug}`));
      }
    } catch {
      report.checks.push(warn('SLUG_CHECK_SKIPPED', 3, 'Could not verify slug uniqueness'));
    }

    return report;
  }

  private runGateSync(
    plan: ContentPlan,
    doc: ArticleDocumentV1,
    context: GenerationContext,
  ): QualityReportV1 {
    const checks: QualityCheckItem[] = [];

    try {
      validateArticleDocumentLayer1(doc);
      checks.push(passed('SCHEMA_VALID', 1, 'Article document schema valid'));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Schema validation failed';
      checks.push(failed('SCHEMA_VALID', 1, message));
      return buildReport(checks);
    }

    const keyword = plan.primaryKeyword.trim().toLowerCase();
    const titleLower = doc.title.toLowerCase();
    const firstText = doc.sections
      .filter((s) => s.text)
      .slice(0, 3)
      .map((s) => s.text ?? '')
      .join(' ')
      .toLowerCase()
      .slice(0, 200);

    if (titleLower.includes(keyword) || firstText.includes(keyword)) {
      checks.push(passed('KEYWORD_PRESENT', 2, 'Primary keyword found in title or opening'));
    } else {
      checks.push(failed('KEYWORD_PRESENT', 2, 'Primary keyword missing from title and opening'));
    }

    if (doc.seo.focusKeyword.toLowerCase() === keyword) {
      checks.push(passed('FOCUS_KEYWORD', 2, 'SEO focus keyword matches plan'));
    } else {
      checks.push(
        failed('FOCUS_KEYWORD', 2, 'SEO focus keyword does not match plan primary keyword'),
      );
    }

    for (const link of doc.internalLinks) {
      const page = context.existingContent.find((c) => c.pageId === link.targetPageId);
      if (!page) {
        checks.push(failed('LINK_EXISTS', 2, `Internal link page missing: ${link.targetPageId}`));
      } else if (page.status !== CmsPageStatus.PUBLISHED && page.type === 'BLOG_POST') {
        checks.push(failed('LINK_PUBLISHED', 2, `Link target not published: ${page.title}`));
      } else {
        checks.push(passed('LINK_OK', 2, `Link valid: ${page.title}`));
      }
    }

    if (doc.qualityFlags.includes('FACT_UNVERIFIED')) {
      checks.push(failed('FACT_VERIFIED', 2, 'FACT_UNVERIFIED flag present'));
    } else {
      checks.push(passed('FACT_VERIFIED', 2, 'No unverified fact flags'));
    }

    const slug = slugifyTitle(doc.title);
    checks.push(info('SLUG_PREVIEW', 3, `Suggested slug: ${slug}`));

    const wordCount = doc.sections
      .flatMap((s) => [s.text ?? '', ...(s.items ?? [])])
      .join(' ')
      .split(/\s+/)
      .filter(Boolean).length;
    if (wordCount >= 300) {
      checks.push(passed('WORD_COUNT', 3, `Word count ~${wordCount}`));
    } else {
      checks.push(warn('WORD_COUNT', 3, `Word count low (~${wordCount})`));
    }

    if (doc.seo.metaDescription.length >= 120 && doc.seo.metaDescription.length <= 160) {
      checks.push(passed('META_LENGTH', 3, 'Meta description length in range'));
    } else {
      checks.push(warn('META_LENGTH', 3, 'Meta description length outside 120-160'));
    }

    return buildReport(checks);
  }
}

function buildReport(checks: QualityCheckItem[]): QualityReportV1 {
  const layer1Passed = !checks.some((c) => c.layer === 1 && !c.passed);
  const layer2Passed = !checks.some((c) => c.layer === 2 && !c.passed);
  const layer3Score = Math.round(
    (checks.filter((c) => c.layer === 3 && c.passed).length /
      Math.max(1, checks.filter((c) => c.layer === 3).length)) *
      100,
  );

  return {
    version: QUALITY_REPORT_VERSION,
    checkedAt: new Date().toISOString(),
    passed: layer1Passed && layer2Passed,
    layer1Passed,
    layer2Passed,
    layer3Score,
    checks,
  };
}

function passed(code: string, layer: 1 | 2 | 3, message: string): QualityCheckItem {
  return { code, layer, severity: 'info', message, passed: true };
}

function failed(code: string, layer: 1 | 2 | 3, message: string): QualityCheckItem {
  return { code, layer, severity: 'error', message, passed: false };
}

function warn(code: string, layer: 1 | 2 | 3, message: string): QualityCheckItem {
  return { code, layer, severity: 'warning', message, passed: true };
}

function info(code: string, layer: 1 | 2 | 3, message: string): QualityCheckItem {
  return { code, layer, severity: 'info', message, passed: true };
}

export { ArticleDocumentValidationError };
