import { CmsPageStatus } from '@prisma/client';
import { CmsService } from './cms.service';

describe('CmsService.publishPage', () => {
  it('preserves existing publishedAt when re-publishing', async () => {
    const original = new Date('2026-08-01T08:00:00.000Z');
    const repository = {
      updatePage: jest.fn().mockResolvedValue({ id: 'p1' }),
      findPageById: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'p1',
          status: CmsPageStatus.PUBLISHED,
          publishedAt: original,
          pageTags: [],
          seo: null,
          categoryRel: null,
        })
        .mockResolvedValueOnce({
          id: 'p1',
          status: CmsPageStatus.PUBLISHED,
          publishedAt: original,
          pageTags: [],
          seo: null,
          categoryRel: null,
        }),
    };

    const service = new CmsService(
      repository as never,
      { upsertSeo: jest.fn() } as never,
      { invalidate: jest.fn() } as never,
    );

    await service.publishPage('p1');

    expect(repository.updatePage).toHaveBeenCalledWith('p1', {
      status: CmsPageStatus.PUBLISHED,
      publishedAt: original,
    });
  });

  it('sets publishedAt when first publishing a draft', async () => {
    const repository = {
      updatePage: jest.fn().mockResolvedValue({ id: 'p2' }),
      findPageById: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'p2',
          status: CmsPageStatus.DRAFT,
          publishedAt: null,
          pageTags: [],
          seo: null,
          categoryRel: null,
        })
        .mockResolvedValueOnce({
          id: 'p2',
          status: CmsPageStatus.PUBLISHED,
          publishedAt: new Date('2026-08-04T00:00:00.000Z'),
          pageTags: [],
          seo: null,
          categoryRel: null,
        }),
    };

    const service = new CmsService(
      repository as never,
      { upsertSeo: jest.fn() } as never,
      { invalidate: jest.fn() } as never,
    );

    const before = Date.now();
    await service.publishPage('p2');
    const after = Date.now();

    const call = repository.updatePage.mock.calls[0][1] as {
      publishedAt: Date;
      status: CmsPageStatus;
    };
    expect(call.status).toBe(CmsPageStatus.PUBLISHED);
    expect(call.publishedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(call.publishedAt.getTime()).toBeLessThanOrEqual(after);
  });
});
