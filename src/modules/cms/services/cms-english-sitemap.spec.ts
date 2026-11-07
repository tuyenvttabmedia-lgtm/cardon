import { CmsPageStatus, CmsPageType } from '@prisma/client';
import { CmsService } from './cms.service';

describe('CmsService.listEnglishSitemap', () => {
  it('returns published English pages and named categories, and drops drafts', async () => {
    const repository = {
      findPublishedEnglishSitemap: jest.fn().mockResolvedValue([
        {
          slug: 'phase-3-1-integration-test',
          type: CmsPageType.PAGE,
          updatedAt: new Date('2026-11-06T01:00:00.000Z'),
          categoryRel: null,
          translations: [{ locale: 'en', status: CmsPageStatus.PUBLISHED }],
        },
        {
          slug: 'hidden-draft',
          type: CmsPageType.BLOG_POST,
          updatedAt: new Date('2026-11-06T01:00:00.000Z'),
          categoryRel: { slug: 'huong-dan' },
          translations: [{ locale: 'en', status: CmsPageStatus.DRAFT }],
        },
      ]),
      findCategoriesWithEnglishCopy: jest.fn().mockResolvedValue([
        {
          slug: 'the-game',
          updatedAt: new Date('2026-11-06T02:00:00.000Z'),
          translations: [{ locale: 'en', name: 'Game cards' }],
        },
        {
          slug: 'blank',
          updatedAt: new Date('2026-11-06T02:00:00.000Z'),
          translations: [{ locale: 'en', name: '  ' }],
        },
      ]),
    };
    const service = new CmsService(repository as never, {} as never, {} as never, {} as never);

    await expect(service.listEnglishSitemap()).resolves.toEqual({
      pages: [
        {
          slug: 'phase-3-1-integration-test',
          type: CmsPageType.PAGE,
          categorySlug: null,
          updatedAt: '2026-11-06T01:00:00.000Z',
        },
      ],
      categories: [{ slug: 'the-game', updatedAt: '2026-11-06T02:00:00.000Z' }],
    });
  });
});
