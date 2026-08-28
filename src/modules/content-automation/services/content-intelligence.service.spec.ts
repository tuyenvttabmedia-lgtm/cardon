import { ContentPlanAction, ContentPlanStatus } from '@prisma/client';
import { ContentIntelligenceService } from './content-intelligence.service';
import { HeuristicAnalyzeStrategy } from '../strategies/heuristic-analyze.strategy';
import type { GenerationContext } from '../entities/generation-context.types';

describe('ContentIntelligenceService', () => {
  let service: ContentIntelligenceService;

  beforeEach(() => {
    service = new ContentIntelligenceService(new HeuristicAnalyzeStrategy());
  });

  const baseContext = (): GenerationContext => ({
    plan: {
      id: 'plan-1',
      status: ContentPlanStatus.DRAFT,
      action: ContentPlanAction.CREATE,
      generationEpoch: 0,
      sourceType: 'MANUAL',
      sourceRefId: null,
      topic: 'Hướng dẫn nạp thẻ',
      primaryKeyword: 'nạp thẻ điện thoại',
      searchIntent: 'INFORMATIONAL',
      contentType: 'GUIDE',
      audience: null,
      businessObjective: null,
      priority: 'MEDIUM',
      suggestedTitle: null,
      intelligenceSnapshot: null,
      outline: null,
      articleDocument: null,
      qualityReport: null,
      references: { supportingKeywords: ['viettel'], angle: 'beginner' },
      cmsPageId: null,
      targetPageId: null,
      createdById: 'user-1',
      outlineApprovedAt: null,
      contentApprovedAt: null,
      publishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    userProvided: {
      topic: 'Hướng dẫn nạp thẻ',
      primaryKeyword: 'nạp thẻ điện thoại',
      searchIntent: 'INFORMATIONAL',
      contentType: 'GUIDE',
      audience: null,
      businessObjective: null,
      supportingKeywords: ['viettel'],
      angle: 'beginner',
    },
    references: { supportingKeywords: ['viettel'], angle: 'beginner' },
    brandContext: {
      siteName: 'CardOn',
      publicUrl: 'https://cardon.vn',
      siteTitle: 'CardOn',
      metaDescription: null,
      companyName: 'CardOn',
      hotline: null,
      email: null,
      address: null,
      source: 'CMS_THEME',
    },
    factContext: { refs: [], source: 'BACKEND' },
    existingContent: [],
    internalLinkCandidates: [],
    aiGenerated: {},
  });

  it('builds heuristic snapshot with HEURISTIC source', () => {
    const snapshot = service.buildHeuristicSnapshot(baseContext());
    expect(snapshot.version).toBe('1');
    expect(snapshot.source).toBe('HEURISTIC');
    expect(snapshot.input.primaryKeyword).toBe('nạp thẻ điện thoại');
    expect(snapshot.input.supportingKeywords).toContain('viettel');
    expect(snapshot.recommendations[0]?.action).toBe(ContentPlanAction.CREATE);
  });

  it('detects HIGH cannibalization when multiple strong matches', () => {
    const context = baseContext();
    context.existingContent = [
      {
        pageId: 'p1',
        title: 'Nạp thẻ điện thoại Viettel',
        slug: 'nap-the-dien-thoai-viettel',
        type: 'BLOG_POST',
        status: 'PUBLISHED',
        categorySlug: 'huong-dan',
        focusKeyword: 'nạp thẻ điện thoại',
        publicPath: '/tin-tuc/huong-dan/nap-the-dien-thoai-viettel',
      },
      {
        pageId: 'p2',
        title: 'Cách nạp thẻ điện thoại nhanh',
        slug: 'cach-nap-the-dien-thoai-nhanh',
        type: 'BLOG_POST',
        status: 'PUBLISHED',
        categorySlug: 'huong-dan',
        focusKeyword: 'nạp thẻ điện thoại',
        publicPath: '/tin-tuc/huong-dan/cach-nap-the-dien-thoai-nhanh',
      },
    ];
    context.internalLinkCandidates = context.existingContent.map((item) => ({
      targetPageId: item.pageId,
      anchorText: item.title,
      reason: 'test',
      confidence: 0.9,
      validated: true,
      publicPath: item.publicPath,
    }));

    const snapshot = service.buildHeuristicSnapshot(context);
    expect(snapshot.cannibalization.risk).toBe('HIGH');
    expect(snapshot.recommendations.some((r) => r.action === ContentPlanAction.UPDATE)).toBe(true);
  });
});
