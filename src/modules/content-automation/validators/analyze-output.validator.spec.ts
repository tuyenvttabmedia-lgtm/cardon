import { ContentPlanAction } from '@prisma/client';
import {
  AnalyzeOutputValidationError,
  validateAndBuildAiSnapshot,
} from './analyze-output.validator';
import type { GenerationContext } from '../entities/generation-context.types';

describe('analyze-output.validator', () => {
  const context: GenerationContext = {
    plan: {} as GenerationContext['plan'],
    userProvided: {
      topic: 'Topic',
      primaryKeyword: 'keyword',
      searchIntent: 'INFORMATIONAL',
      contentType: 'GUIDE',
      audience: null,
      businessObjective: null,
      supportingKeywords: [],
      angle: null,
    },
    references: {},
    brandContext: {
      siteName: 'CardOn',
      publicUrl: '',
      siteTitle: null,
      metaDescription: null,
      companyName: null,
      hotline: null,
      email: null,
      address: null,
      source: 'CMS_THEME',
    },
    factContext: { refs: [], source: 'BACKEND' },
    existingContent: [
      {
        pageId: 'p1',
        title: 'Title',
        slug: 'slug',
        type: 'BLOG_POST',
        status: 'PUBLISHED',
        categorySlug: 'cat',
        focusKeyword: 'kw',
        publicPath: '/tin-tuc/cat/slug',
      },
    ],
    internalLinkCandidates: [],
    aiGenerated: {},
  };

  it('accepts valid AI payload and sets source AI', () => {
    const snapshot = validateAndBuildAiSnapshot(
      {
        relatedContent: [
          { pageId: 'p1', title: 'Title', similarityScore: 0.8, reason: 'match' },
        ],
        cannibalization: { risk: 'NONE', matches: [] },
        recommendations: [
          { action: ContentPlanAction.CREATE, pageId: null, confidence: 0.9, reason: 'ok' },
        ],
        internalLinkCandidates: [{ pageId: 'p1', title: 'Title', relevanceScore: 0.7 }],
      },
      context,
    );

    expect(snapshot.source).toBe('AI');
    expect(snapshot.version).toBe('1');
  });

  it('accepts snake_case and wrapped AI payloads', () => {
    const snapshot = validateAndBuildAiSnapshot(
      {
        result: {
          related_content: [
            { page_id: 'p1', title: 'Title', similarity_score: 0.8, reason: 'match' },
          ],
          cannibalization: { risk: 'NONE', matches: [] },
          recommendations: [
            { action: ContentPlanAction.CREATE, page_id: null, confidence: 0.9, reason: 'ok' },
          ],
          internal_link_candidates: [],
        },
      },
      context,
    );

    expect(snapshot.source).toBe('AI');
    expect(snapshot.relatedContent[0]?.pageId).toBe('p1');
  });

  it('strips unknown pageIds instead of failing the job', () => {
    const snapshot = validateAndBuildAiSnapshot(
      {
        relatedContent: [
          { pageId: 'p1', title: 'Title', similarityScore: 0.8, reason: 'match' },
          { pageId: 'd7fbb0fd-6616-45fa-8e90-3e3ba28abf20', title: 'Hallucinated', similarityScore: 0.5, reason: 'x' },
        ],
        cannibalization: {
          risk: 'HIGH',
          matches: [
            {
              pageId: 'bad-id',
              title: 'X',
              focusKeyword: null,
              score: 0.9,
            },
          ],
        },
        recommendations: [
          {
            action: ContentPlanAction.UPDATE,
            pageId: 'missing-page',
            confidence: 0.8,
            reason: 'update old',
          },
        ],
        internalLinkCandidates: [
          { pageId: 'p1', title: 'Title', relevanceScore: 0.7 },
          { pageId: 'd7fbb0fd-6616-45fa-8e90-3e3ba28abf20', title: 'Bad', relevanceScore: 0.4 },
        ],
      },
      context,
    );

    expect(snapshot.relatedContent).toHaveLength(1);
    expect(snapshot.relatedContent[0]?.pageId).toBe('p1');
    expect(snapshot.cannibalization.matches).toHaveLength(0);
    expect(snapshot.cannibalization.risk).toBe('NONE');
    expect(snapshot.internalLinkCandidates).toHaveLength(1);
    expect(snapshot.recommendations[0]?.action).toBe(ContentPlanAction.CREATE);
    expect(snapshot.recommendations[0]?.pageId).toBeNull();
  });

  it('rejects href in output', () => {
    expect(() =>
      validateAndBuildAiSnapshot(
        {
          relatedContent: [],
          cannibalization: { risk: 'NONE', matches: [] },
          recommendations: [],
          internalLinkCandidates: [],
          href: 'https://example.com',
        },
        context,
      ),
    ).toThrow(AnalyzeOutputValidationError);
  });
});
