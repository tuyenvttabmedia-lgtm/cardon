import { coerceArticleDocument } from './article-document.normalize';
import { validateAndBuildArticleDocument } from './article-document.validator';
import type { GenerationContext } from '../entities/generation-context.types';

describe('article-document.normalize', () => {
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

  it('expands type=section outline blocks into h2 + paragraph + ul', () => {
    const coerced = coerceArticleDocument({
      title: 'Bai viet',
      seo: {
        metaTitle: 'Meta',
        metaDescription: 'Desc',
        focusKeyword: 'keyword',
      },
      sections: [
        {
          type: 'section',
          id: 's1',
          heading: 'Muc 1',
          summary: 'Tom tat muc 1',
          keyPoints: ['A', 'B'],
        },
      ],
    }) as { sections: Array<{ type: string; text?: string; items?: string[] }> };

    expect(coerced.sections.map((s) => s.type)).toEqual(['h2', 'paragraph', 'ul']);
    expect(coerced.sections[0]?.text).toBe('Muc 1');
    expect(coerced.sections[2]?.items).toEqual(['A', 'B']);
  });

  it('accepts expanded section payload via validator', () => {
    const doc = validateAndBuildArticleDocument(
      {
        title: 'Bai viet',
        seo: {
          metaTitle: 'Meta',
          metaDescription: 'Desc',
          focusKeyword: 'keyword',
        },
        sections: [
          {
            type: 'section',
            heading: 'Huong dan',
            summary: 'Noi dung chi tiet',
          },
        ],
      },
      context,
      'AI',
    );

    expect(doc.sections).toHaveLength(2);
    expect(doc.sections[0]?.type).toBe('h2');
    expect(doc.sections[1]?.type).toBe('paragraph');
  });
});
