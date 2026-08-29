import { ContentPlanContentType, ContentPlanSearchIntent } from '@prisma/client';
import type { ContentPlan } from '@prisma/client';
import type { ArticleDocumentV1 } from '../entities/article-document.types';
import type { GenerationContext } from '../entities/generation-context.types';
import {
  runEditorialSoftChecks,
  textSimilarity,
} from './editorial-quality.checks';

function basePlan(over: Partial<ContentPlan> = {}): ContentPlan {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    status: 'CONTENT_READY',
    action: 'CREATE',
    generationEpoch: 0,
    sourceType: 'MANUAL',
    sourceRefId: null,
    topic: 'Sim bị khóa 1 chiều',
    primaryKeyword: 'sim bị khóa 1 chiều',
    searchIntent: ContentPlanSearchIntent.INFORMATIONAL,
    contentType: ContentPlanContentType.TROUBLESHOOTING,
    audience: null,
    businessObjective: null,
    priority: 'MEDIUM',
    suggestedTitle: 'Sim bị khóa 1 chiều: nguyên nhân và cách mở',
    intelligenceSnapshot: null,
    outline: null,
    articleDocument: null,
    qualityReport: null,
    references: null,
    cmsPageId: null,
    targetPageId: null,
    createdById: '00000000-0000-0000-0000-000000000002',
    outlineApprovedAt: null,
    contentApprovedAt: null,
    publishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as ContentPlan;
}

function emptyContext(over?: Partial<GenerationContext>): GenerationContext {
  return {
    plan: basePlan(),
    userProvided: {
      topic: 'Sim bị khóa 1 chiều',
      primaryKeyword: 'sim bị khóa 1 chiều',
      searchIntent: 'INFORMATIONAL',
      contentType: 'TROUBLESHOOTING',
      audience: null,
      businessObjective: null,
      supportingKeywords: [],
      angle: null,
    },
    brandContext: { siteName: 'CardOn', companyName: 'CardOn' },
    factContext: { refs: [] },
    existingContent: [],
    internalLinkCandidates: [],
    ...over,
  } as GenerationContext;
}

describe('editorial-quality.checks', () => {
  it('detects duplicate paragraph + list opening', () => {
    const doc: ArticleDocumentV1 = {
      schemaVersion: '1.0',
      title: 'Sim khóa 1 chiều',
      seo: {
        metaTitle: 'x'.repeat(30),
        metaDescription: 'y'.repeat(130),
        focusKeyword: 'sim bị khóa 1 chiều',
      },
      sections: [
        {
          id: '1',
          type: 'paragraph',
          text: 'Sim bị khóa 1 chiều là trạng thái chỉ chặn một chiều liên lạc gọi đi hoặc gọi đến.',
        },
        {
          id: '2',
          type: 'ul',
          items: [
            'Sim bị khóa 1 chiều chỉ chặn một chiều liên lạc gọi đi hoặc gọi đến',
            'Người dùng vẫn gọi hoặc nhận tùy chiều bị khóa',
          ],
        },
      ],
      factRefs: [],
      internalLinks: [],
      qualityFlags: [],
    };
    const checks = runEditorialSoftChecks(basePlan(), doc, emptyContext());
    const dup = checks.find((c) => c.code === 'DUP_OPENING');
    expect(dup?.severity).toBe('warning');
  });

  it('flags off-topic CTA H2 early on troubleshooting', () => {
    const doc: ArticleDocumentV1 = {
      schemaVersion: '1.0',
      title: 'Sim khóa',
      seo: {
        metaTitle: 'x'.repeat(30),
        metaDescription: 'y'.repeat(130),
        focusKeyword: 'sim bị khóa 1 chiều',
      },
      sections: [
        { id: '1', type: 'h2', text: 'So sánh các loại thẻ nạp Viettel' },
        { id: '2', type: 'paragraph', text: 'Nội dung bán thẻ.' },
        { id: '3', type: 'h2', text: 'Nguyên nhân' },
        { id: '4', type: 'paragraph', text: 'Hết tiền.' },
      ],
      factRefs: [],
      internalLinks: [],
      qualityFlags: [],
    };
    const checks = runEditorialSoftChecks(basePlan(), doc, emptyContext());
    const off = checks.find((c) => c.code === 'OFF_TOPIC_CTA');
    expect(off?.severity).toBe('warning');
  });

  it('computes text similarity for near-duplicates', () => {
    expect(
      textSimilarity(
        'Sim bị khóa một chiều liên lạc gọi đi',
        'Sim bị khóa một chiều liên lạc gọi đi hoặc gọi đến',
      ),
    ).toBeGreaterThan(0.5);
  });
});
